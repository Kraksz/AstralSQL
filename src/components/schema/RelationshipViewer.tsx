import { ArrowRight, GitFork, KeyRound, Link2, Table2 } from "lucide-react";
import type { TableInfo } from "../../lib/types";

export function RelationshipViewer({ tables }: { tables: TableInfo[] }) {
  const relations = tables.flatMap((table) =>
    table.foreignKeys.map((foreignKey) => ({ table, ...foreignKey })),
  );
  return (
    <div className="relationship-viewer">
      <div className="relationship-heading">
        <GitFork size={20} />
        <div>
          <h2>Your schema, connected.</h2>
          <p>
            {tables.length} tables · {relations.length} foreign key
            relationships
          </p>
        </div>
      </div>
      <div className="relationship-tables">
        {tables.map((table) => (
          <section
            className="relationship-table-card"
            key={`${table.schema}.${table.name}`}
            aria-label={`${table.name} table`}
          >
            <h3>
              <Table2 size={15} />
              {table.name}
              <span>{table.columns.length} columns</span>
            </h3>
            <ul>
              {table.columns.map((column) => (
                <li key={column.name}>
                  {column.primaryKey ? (
                    <KeyRound size={12} />
                  ) : table.foreignKeys.some(
                      (key) => key.column === column.name,
                    ) ? (
                    <Link2 size={12} />
                  ) : (
                    <span className="relationship-column-dot" />
                  )}
                  <span>{column.name}</span>
                  <small>{column.dataType.toLowerCase()}</small>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div
        className="relationship-links"
        aria-label="Foreign key relationships"
      >
        {relations.length ? (
          relations.map((relation, index) => (
            <div
              className="relationship-link"
              key={`${relation.table.name}-${relation.column}-${index}`}
            >
              <Link2 size={14} />
              <code>
                {relation.table.name}.<strong>{relation.column}</strong>
              </code>
              <ArrowRight size={15} />
              <code>
                {relation.referencedTable}.
                <strong>{relation.referencedColumn}</strong>
              </code>
              <span>many → one</span>
            </div>
          ))
        ) : (
          <p className="schema-empty">
            No foreign keys are declared in this database.
          </p>
        )}
      </div>
    </div>
  );
}

export default RelationshipViewer;
