import * as fsSyncer from 'fs-syncer'
import * as typegen from '../src'
import {getHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  await helper.pool.query(helper.sql`
    create table table1(a int not null);
    create table table2(b int not null);

    insert into table1 (a) values (1), (2), (3);
    insert into table2 (b) values (2), (3), (4);
  `)
})

test('joins which introduce nullable rows', async () => {
  const syncer = fsSyncer.jestFixture({
    targetState: {
      'index.ts': `
        import {sql, createPool} from 'slonik'

        export default [
          sql\`select a, b from table1 left join table2 on table1.a = table2.b\`,
          sql\`select a, b from table1 t1 left join table2 t2 on t1.a = t2.b\`,
          sql\`select a, b from table1 full outer join table2 on table1.a = table2.b\`,
          sql\`select a, b from table1 t1 full outer join table2 t2 on t1.a = t2.b\`,
        ]
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql, createPool} from 'slonik'
      
      export default [
        sql<queries.Table1_Table2>\`select a, b from table1 left join table2 on table1.a = table2.b\`,
        sql<queries.Table1_Table2>\`select a, b from table1 t1 left join table2 t2 on t1.a = t2.b\`,
        sql<queries.Table1_Table2_0>\`select a, b from table1 full outer join table2 on table1.a = table2.b\`,
        sql<queries.Table1_Table2_0>\`select a, b from table1 t1 full outer join table2 t2 on t1.a = t2.b\`,
      ]
      
      export declare namespace queries {
        // Generated by @slonik/typegen
      
        /**
         * queries:
         * - \`select a, b from table1 left join table2 on table1.a = table2.b\`
         * - \`select a, b from table1 t1 left join table2 t2 on t1.a = t2.b\`
         */
        export interface Table1_Table2 {
          /** column: \`left_join_test.table1.a\`, not null: \`true\`, regtype: \`integer\` */
          a: number
      
          /** column: \`left_join_test.table2.b\`, regtype: \`integer\` */
          b: number | null
        }
      
        /**
         * queries:
         * - \`select a, b from table1 full outer join table2 on table1.a = table2.b\`
         * - \`select a, b from table1 t1 full outer join table2 t2 on t1.a = t2.b\`
         */
        export interface Table1_Table2_0 {
          /** column: \`left_join_test.table1.a\`, regtype: \`integer\` */
          a: number | null
      
          /** column: \`left_join_test.table2.b\`, regtype: \`integer\` */
          b: number | null
        }
      }
      "
  `)
})
