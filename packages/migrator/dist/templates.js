"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.javascript = exports.typescript = exports.sqlDown = exports.sqlUp = void 0;
exports.sqlUp = `raise 'up migration not implemented'
`;
exports.sqlDown = `raise 'down migration not implemented'
`;
exports.typescript = `
import {Migration} from '@slonik/migrator'

export const up: Migration = async ({context: {connection, sql}}) => {
  await connection.query(sql\`raise 'up migration not implemented'\`)
}

export const down: Migration = async ({context: {connection, sql}}) => {
  await connection.query(sql\`raise 'down migration not implemented'\`)
}
`.trimLeft();
exports.javascript = `
/** @type {import('@slonik/migrator').Migration} */
exports.up = async ({context: {connection, sql}}) => {
  await connection.query(sql\`raise 'up migration not implemented'\`)
}

/** @type {import('@slonik/migrator').Migration} */
exports.down = async ({context: {connection, sql}}) => {
  await connection.query(sql\`raise 'down migration not implemented'\`)
}
`.trimLeft();
//# sourceMappingURL=templates.js.map