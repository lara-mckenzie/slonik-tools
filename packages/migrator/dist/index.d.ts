/// <reference types="node" />
import * as umzug from 'umzug';
import { sql, DatabaseTransactionConnection, DatabasePoolConnection, DatabasePool } from 'slonik';
interface SlonikMigratorContext {
    parent: DatabasePool;
    connection: DatabaseTransactionConnection;
    sql: typeof sql;
}
export declare class SlonikMigrator extends umzug.Umzug<SlonikMigratorContext> {
    private slonikMigratorOptions;
    constructor(slonikMigratorOptions: {
        slonik: DatabasePool;
        migrationsPath: string;
        migrationTableName: string | string[];
        logger: umzug.UmzugOptions['logger'];
        singleTransaction?: true;
    });
    /**
     * Logs messages to console. Known events are prettified to strings, unknown
     * events or unexpected message properties in known events are logged as objects.
     */
    static prettyLogger: NonNullable<SlonikMigratorOptions['logger']>;
    getCli(options?: umzug.CommandLineParserOptions): umzug.UmzugCLI;
    runAsCLI(argv?: string[]): Promise<boolean>;
    /** Glob pattern with `migrationsPath` as `cwd`. Could be overridden to support nested directories */
    protected migrationsGlob(): string;
    /** Gets a hexadecimal integer to pass to postgres's `select pg_advisory_lock()` function */
    protected advisoryLockId(): number;
    protected migrationTableNameIdentifier(): import("slonik").IdentifierSqlToken;
    protected template(filepath: string): Array<[string, string]>;
    protected resolver(params: umzug.MigrationParams<SlonikMigratorContext>): umzug.RunnableMigration<SlonikMigratorContext>;
    protected getOrCreateMigrationsTable(context: SlonikMigratorContext): Promise<void>;
    runCommand<T>(command: string, cb: (params: {
        context: SlonikMigratorContext;
    }) => Promise<T>): Promise<T>;
    repair(options?: RepairOptions): Promise<void>;
    protected hash(name: string): string;
    protected executedNames({ context }: {
        context: SlonikMigratorContext;
    }): Promise<string[]>;
    /**
     * Returns the name, dbHash and diskHash for each executed migration.
     */
    private executedInfos;
    protected logMigration({ name, context }: {
        name: string;
        context: SlonikMigratorContext;
    }): Promise<void>;
    protected unlogMigration({ name, context }: {
        name: string;
        context: SlonikMigratorContext;
    }): Promise<void>;
    protected repairMigration({ name, hash, context }: {
        name: string;
        hash: string;
        context: SlonikMigratorContext;
    }): Promise<void>;
}
export declare type Migration = (params: umzug.MigrationParams<SlonikMigratorContext> & {
    /** @deprecated use `context.connection` */
    slonik: DatabaseTransactionConnection;
    /** @deprecated use `context.sql` */
    sql: typeof sql;
}) => Promise<unknown>;
/**
 * Should either be a `DatabasePool` or `DatabasePoolConnection`. If it's a `DatabasePool` with an `.end()`
 * method, the `.end()` method will be called after running the migrator as a CLI.
 */
export interface SlonikConnection extends DatabasePoolConnection {
    end?: () => Promise<void>;
}
export interface SlonikMigratorOptions {
    /**
     * Slonik instance for running migrations. You can import this from the same place as your main application,
     * or import another slonik instance with different permissions, security settings etc.
     */
    slonik: DatabasePool;
    /**
     * Path to folder that will contain migration files.
     */
    migrationsPath: string;
    /**
     * REQUIRED table name. @slonik/migrator will manage this table for you, but you have to tell it the name
     * Note: prior to version 0.6.0 this had a default value of "migration", so if you're upgrading from that
     * version, you should name it that!
     */
    migrationTableName: string | string[];
    /**
     * Logger with `info`, `warn`, `error` and `debug` methods - set explicitly to `undefined` to disable logging
     */
    logger: umzug.UmzugOptions['logger'];
}
/**
 * Narrowing of @see umzug.UmzugOptions where the migrations input type specifically, uses `glob`
 */
export declare type SlonikUmzugOptions = umzug.UmzugOptions<SlonikMigratorContext> & {
    migrations: umzug.GlobInputMigrations<SlonikMigratorContext>;
};
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
export declare const setupSlonikMigrator: (options: SlonikMigratorOptions & {
    /**
     * @deprecated Use `.runAsCLI()`, e.g. `if (require.main === module) migrator.runAsCLI()`
     *
     * ~OPTIONAL "module" value. If you set `mainModule: module` in a nodejs script, that script will become a
     * runnable CLI when invoked directly, but the migrator object can still be imported as normal if a different
     * entrypoint is used.~
     */
    mainModule?: NodeModule;
    reasonForUsingDeprecatedAPI: 'Back-compat' | 'Testing' | `Life's too short` | 'Other';
}) => SlonikMigrator;
export interface RepairOptions {
    dryRun?: boolean;
}
export {};
//# sourceMappingURL=index.d.ts.map