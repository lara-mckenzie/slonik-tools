"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSlonikMigrator = exports.SlonikMigrator = void 0;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const umzug = require("umzug");
const slonik_1 = require("slonik");
const path = require("path");
const ts_command_line_1 = require("@rushstack/ts-command-line");
const templates = require("./templates");
const zod_1 = require("zod");
class SlonikMigrator extends umzug.Umzug {
    constructor(slonikMigratorOptions) {
        super({
            context: () => ({
                parent: slonikMigratorOptions.slonik,
                sql: slonik_1.sql,
                connection: null, // connection function is added later by storage setup.
            }),
            migrations: () => ({
                glob: [this.migrationsGlob(), { cwd: path.resolve(slonikMigratorOptions.migrationsPath) }],
                resolve: params => this.resolver(params),
            }),
            storage: {
                executed: (...args) => this.executedNames(...args),
                logMigration: (...args) => this.logMigration(...args),
                unlogMigration: (...args) => this.unlogMigration(...args),
            },
            logger: slonikMigratorOptions.logger,
            create: {
                template: filepath => this.template(filepath),
                folder: path.resolve(slonikMigratorOptions.migrationsPath),
            },
        });
        this.slonikMigratorOptions = slonikMigratorOptions;
        if ('mainModule' in slonikMigratorOptions) {
            throw new Error(`Using \`mainModule\` is deprecated. Use \`migrator.runAsCLI()\` instead.`);
        }
        if (!slonikMigratorOptions.migrationTableName) {
            throw new Error(`@slonik/migrator: Relying on the default migration table name is deprecated. You should set this explicitly to 'migration' if you've used a prior version of this library.`);
        }
    }
    getCli(options) {
        const cli = super.getCli({ toolDescription: `@slonik/migrator - PostgreSQL migration tool`, ...options });
        cli.addAction(new RepairAction(this));
        return cli;
    }
    async runAsCLI(argv) {
        var _a, _b;
        const result = await super.runAsCLI(argv);
        await ((_b = (_a = this.slonikMigratorOptions.slonik).end) === null || _b === void 0 ? void 0 : _b.call(_a));
        return result;
    }
    /** Glob pattern with `migrationsPath` as `cwd`. Could be overridden to support nested directories */
    migrationsGlob() {
        return './*.{js,ts,sql}';
    }
    /** Gets a hexadecimal integer to pass to postgres's `select pg_advisory_lock()` function */
    advisoryLockId() {
        const hashable = '@slonik/migrator advisory lock:' + JSON.stringify(this.slonikMigratorOptions.migrationTableName);
        const hex = (0, crypto_1.createHash)('md5').update(hashable).digest('hex').slice(0, 8);
        return parseInt(hex, 16);
    }
    migrationTableNameIdentifier() {
        const table = this.slonikMigratorOptions.migrationTableName;
        return slonik_1.sql.identifier(Array.isArray(table) ? table : [table]);
    }
    template(filepath) {
        if (filepath.endsWith('.ts')) {
            return [[filepath, templates.typescript]];
        }
        if (filepath.endsWith('.js')) {
            return [[filepath, templates.javascript]];
        }
        const downPath = path.join(path.dirname(filepath), 'down', path.basename(filepath));
        return [
            [filepath, templates.sqlUp],
            [downPath, templates.sqlDown],
        ];
    }
    resolver(params) {
        if (path.extname(params.name) === '.sql') {
            return {
                name: params.name,
                path: params.path,
                up: async ({ path, context }) => {
                    await context.connection.query(rawQuery((0, fs_1.readFileSync)(path, 'utf8')));
                },
                down: async ({ path, context }) => {
                    const downPath = (0, path_1.join)((0, path_1.dirname)(path), 'down', (0, path_1.basename)(path));
                    await context.connection.query(rawQuery((0, fs_1.readFileSync)(downPath, 'utf8')));
                },
            };
        }
        const { connection: slonik } = params.context;
        const migrationModule = require(params.path);
        return {
            name: params.name,
            path: params.path,
            up: async (upParams) => migrationModule.up({ slonik, sql: slonik_1.sql, ...upParams }),
            down: async (downParams) => { var _a; return (_a = migrationModule.down) === null || _a === void 0 ? void 0 : _a.call(migrationModule, { slonik, sql: slonik_1.sql, ...downParams }); },
        };
    }
    async getOrCreateMigrationsTable(context) {
        await context.parent.query(slonik_1.sql.unsafe `
      create table if not exists ${this.migrationTableNameIdentifier()}(
        name text primary key,
        hash text not null,
        date timestamptz not null default now()
      )
    `);
    }
    async runCommand(command, cb) {
        let run = cb;
        if (command === 'up' || command === 'down') {
            run = async ({ context }) => {
                return context.parent.connect(async (conn) => {
                    const logger = this.slonikMigratorOptions.logger;
                    const timeout = setTimeout(() => logger === null || logger === void 0 ? void 0 : logger.info({
                        message: `Waiting for lock. This may mean another process is simultaneously running migrations. You may want to issue a command like "set lock_timeout = '10s'" if this happens frequently. Othrewise, this command may wait until the process is killed.`,
                    }), 1000);
                    await conn.any(context.sql.unsafe `select pg_advisory_lock(${this.advisoryLockId()})`);
                    try {
                        clearTimeout(timeout);
                        const result = await cb({ context });
                        return result;
                    }
                    finally {
                        await conn.any(context.sql.unsafe `select pg_advisory_unlock(${this.advisoryLockId()})`).catch(error => {
                            var _a;
                            (_a = this.slonikMigratorOptions.logger) === null || _a === void 0 ? void 0 : _a.error({
                                message: `Failed to unlock. This is expected if the lock acquisition timed out. Otherwise, you may need to run "select pg_advisory_unlock(${this.advisoryLockId()})" manually`,
                                originalError: error,
                            });
                        });
                    }
                });
            };
        }
        return super.runCommand(command, async ({ context: _ctx }) => {
            const connect = this.slonikMigratorOptions.singleTransaction ? _ctx.parent.transaction : _ctx.parent.connect;
            return connect(async (connection) => {
                const context = { ..._ctx, connection };
                await this.getOrCreateMigrationsTable(context);
                return run({ context });
            });
        });
    }
    async repair(options) {
        var _a;
        const dryRun = (_a = options === null || options === void 0 ? void 0 : options.dryRun) !== null && _a !== void 0 ? _a : false;
        await this.runCommand('repair', async ({ context }) => {
            var _a, _b;
            const infos = await this.executedInfos(context);
            const migrationsThatNeedRepair = infos.filter(({ dbHash, diskHash }) => dbHash !== diskHash);
            if (migrationsThatNeedRepair.length === 0) {
                (_a = this.slonikMigratorOptions.logger) === null || _a === void 0 ? void 0 : _a.info({ message: 'Nothing to repair' });
                return;
            }
            for (const { migration, dbHash, diskHash } of migrationsThatNeedRepair) {
                (_b = this.slonikMigratorOptions.logger) === null || _b === void 0 ? void 0 : _b.warn({
                    message: `Repairing migration ${migration}`,
                    migration,
                    oldHash: dbHash,
                    newHash: diskHash,
                    dryRun,
                });
                if (!dryRun)
                    await this.repairMigration({ name: migration, hash: diskHash, context });
            }
        });
    }
    hash(name) {
        return (0, crypto_1.createHash)('md5')
            .update((0, fs_1.readFileSync)((0, path_1.join)(this.slonikMigratorOptions.migrationsPath, name), 'utf8').trim().replace(/\s+/g, ' '))
            .digest('hex')
            .slice(0, 10);
    }
    async executedNames({ context }) {
        const infos = await this.executedInfos(context);
        infos
            .filter(({ dbHash, diskHash }) => dbHash !== diskHash)
            .forEach(({ migration, dbHash, diskHash }) => {
            var _a;
            (_a = this.slonikMigratorOptions.logger) === null || _a === void 0 ? void 0 : _a.warn({
                message: `hash in '${this.slonikMigratorOptions.migrationTableName}' table didn't match content on disk.`,
                question: `Did you try to change a migration file after it had been run? If you upgraded from v0.8.X-v0.9.X to v.0.10.X, you might need to run the 'repair' command.`,
                migration,
                dbHash,
                diskHash,
            });
        });
        return infos.map(({ migration }) => migration);
    }
    /**
     * Returns the name, dbHash and diskHash for each executed migration.
     */
    async executedInfos(context) {
        await this.getOrCreateMigrationsTable(context);
        const migrations = await context.parent.any(slonik_1.sql.unsafe `select name, hash from ${this.migrationTableNameIdentifier()}`);
        return migrations.map(r => {
            const name = r.name;
            return {
                migration: name,
                dbHash: r.hash,
                diskHash: this.hash(name),
            };
        });
    }
    async logMigration({ name, context }) {
        await context.connection.query(slonik_1.sql.unsafe `
      insert into ${this.migrationTableNameIdentifier()}(name, hash)
      values (${name}, ${this.hash(name)})
    `);
    }
    async unlogMigration({ name, context }) {
        await context.connection.query(slonik_1.sql.unsafe `
      delete from ${this.migrationTableNameIdentifier()}
      where name = ${name}
    `);
    }
    async repairMigration({ name, hash, context }) {
        await context.connection.query(slonik_1.sql.unsafe `
      update ${this.migrationTableNameIdentifier()}
      set hash = ${hash}
      where name = ${name}
    `);
    }
}
exports.SlonikMigrator = SlonikMigrator;
/**
 * Logs messages to console. Known events are prettified to strings, unknown
 * events or unexpected message properties in known events are logged as objects.
 */
SlonikMigrator.prettyLogger = {
    info: message => prettifyAndLog('info', message),
    warn: message => prettifyAndLog('warn', message),
    error: message => prettifyAndLog('error', message),
    debug: message => prettifyAndLog('debug', message),
};
/**
 * More reliable than slonik-sql-tag-raw: https://github.com/gajus/slonik-sql-tag-raw/issues/6
 * But doesn't sanitise any inputs, so shouldn't be used with templates
 */
const rawQuery = (query) => ({
    type: 'SLONIK_TOKEN_QUERY',
    sql: query,
    values: [],
    parser: zod_1.z.any(),
});
/**
 * @deprecated use `new SlonikMigrator(...)` which takes the same options.
 *
 * Note: `mainModule` is not passed into `new SlonikMigrator(...)`. To get the same functionality, use `.runAsCLI()`
 *
 * @example
 * ```
 * const migrator = new SlonikMigrator(...)
 *
 * if (require.main === module) {
 *  migrator.runAsCLI()
 * }
 * ```
 */
const setupSlonikMigrator = (options) => {
    console.warn(`@slonik/migrator: Use of ${exports.setupSlonikMigrator.name} is deprecated. Use \`new SlonikMigrator(...)\` which takes the same options instead`);
    const defaultMigrationTableName = () => {
        console.warn(`Relying on the default migration table name is deprecated. You should set this explicitly to 'migration'`);
        return 'migration';
    };
    const migrator = new SlonikMigrator({
        slonik: options.slonik,
        migrationsPath: options.migrationsPath,
        migrationTableName: options.migrationTableName || defaultMigrationTableName(),
        logger: options.logger,
    });
    if (options.mainModule === require.main) {
        console.warn(`Using \`mainModule\` is deprecated. Use \`migrator.runAsCLI()\` instead.`);
        migrator.runAsCLI();
    }
    return migrator;
};
exports.setupSlonikMigrator = setupSlonikMigrator;
class RepairAction extends ts_command_line_1.CommandLineAction {
    constructor(slonikMigrator) {
        super({
            actionName: 'repair',
            summary: 'Repair hashes in the migration table',
            documentation: 'If, for any reason, the hashes are incorrectly stored in the database, you can recompute them using this command. Note that due to a bug in @slonik/migrator v0.8.X-v0.9-X the hashes were incorrectly calculated, so this command is recommended after upgrading to v0.10.',
        });
        this.slonikMigrator = slonikMigrator;
    }
    onDefineParameters() {
        this.dryRunFlag = this.defineFlagParameter({
            parameterShortName: '-d',
            parameterLongName: '--dry-run',
            description: 'No changes are actually made',
        });
    }
    async onExecute() {
        await this.slonikMigrator.repair({ dryRun: this.dryRunFlag.value });
    }
}
const createMessageFormats = (formats) => formats;
const MESSAGE_FORMATS = createMessageFormats({
    created: msg => {
        const { event, path, ...rest } = msg;
        return [`created   ${path}`, rest];
    },
    migrating: msg => {
        const { event, name, ...rest } = msg;
        return [`migrating ${name}`, rest];
    },
    migrated: msg => {
        const { event, name, durationSeconds, ...rest } = msg;
        return [`migrated  ${name} in ${durationSeconds} s`, rest];
    },
    reverting: msg => {
        const { event, name, ...rest } = msg;
        return [`reverting ${name}`, rest];
    },
    reverted: msg => {
        const { event, name, durationSeconds, ...rest } = msg;
        return [`reverted  ${name} in ${durationSeconds} s`, rest];
    },
    up: msg => {
        const { event, message, ...rest } = msg;
        return [`up migration completed, ${message}`, rest];
    },
    down: msg => {
        const { event, message, ...rest } = msg;
        return [`down migration completed, ${message}`, rest];
    },
});
function isProperEvent(event) {
    return typeof event === 'string' && event in MESSAGE_FORMATS;
}
function prettifyAndLog(level, message) {
    const { event } = message || {};
    if (!isProperEvent(event))
        return console[level](message);
    const [messageStr, rest] = MESSAGE_FORMATS[event](message);
    console[level](messageStr);
    if (Object.keys(rest).length > 0)
        console[level](rest);
}
//# sourceMappingURL=index.js.map