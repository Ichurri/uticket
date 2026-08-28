import { chairPositions, CHAIR_SIZE } from "@/lib/venue-layout";
import type { TableShape } from "@/generated/prisma/enums";

export interface GlyphTable {
  label: string;
  seats: number;
  hasChairs: boolean;
  shape: TableShape;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * One table drawn where it stands, chairs and all. Zone-relative, like the
 * stored coordinates. Kept free of editor state so the buyer's map can draw
 * exactly the same thing with different colours.
 */
export function TableGlyph({
  table,
  fill,
  stroke,
  labelFill,
  muted = false,
  children,
}: {
  table: GlyphTable;
  fill: string;
  stroke: string;
  /** Label colour, when the fill is too dark to write on in `stroke` */
  labelFill?: string;
  /** Dim it — taken, or not on sale */
  muted?: boolean;
  children?: React.ReactNode;
}) {
  const cx = table.posX + table.width / 2;
  const cy = table.posY + table.height / 2;
  const chairs = table.hasChairs ? chairPositions(table) : [];

  return (
    <g
      transform={`translate(${cx},${cy}) rotate(${table.rotation})`}
      opacity={muted ? 0.45 : 1}
    >
      {chairs.map((chair, index) => (
        <rect
          key={index}
          x={-CHAIR_SIZE / 2}
          y={-CHAIR_SIZE / 2 + 1}
          width={CHAIR_SIZE}
          height={CHAIR_SIZE - 3}
          rx={2.5}
          fill={stroke}
          opacity={0.55}
          transform={`translate(${chair.x},${chair.y}) rotate(${chair.angle})`}
        />
      ))}

      {table.shape === "ROUND" ? (
        <circle
          r={table.width / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
        />
      ) : (
        <rect
          x={-table.width / 2}
          y={-table.height / 2}
          width={table.width}
          height={table.height}
          rx={table.shape === "SQUARE" ? 8 : 6}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
        />
      )}

      {/* Counter-rotate the text so a tilted table is still readable */}
      <g transform={`rotate(${-table.rotation})`}>
        <text
          textAnchor="middle"
          y={table.hasChairs ? 0 : -2}
          fontSize={13}
          fontWeight={700}
          fill={labelFill ?? stroke}
        >
          {table.label}
        </text>
        {!table.hasChairs && (
          <text
            textAnchor="middle"
            y={12}
            fontSize={10}
            fill={labelFill ?? stroke}
            opacity={0.8}
          >
            {table.seats} pers.
          </text>
        )}
      </g>
      {children}
    </g>
  );
}
