import type { CitySnapshot } from "@/lib/city/types";

/** Derived street geometry shared by ground, lamps and traffic. */
export interface StreetLayout {
  pitch: number;
  block: number;
  street: number;
  /** Centre lines of north–south roads (x) and east–west roads (z). */
  roadsX: number[];
  roadsZ: number[];
  blockCenters: [number, number][];
  extent: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export function streetLayout(grid: CitySnapshot["grid"]): StreetLayout {
  const { cols, rows, block, street, originX, originZ } = grid;
  const pitch = block + street;
  const roadsX = Array.from({ length: cols + 1 }, (_, i) => originX + i * pitch - street / 2);
  const roadsZ = Array.from({ length: rows + 1 }, (_, i) => originZ + i * pitch - street / 2);
  const blockCenters: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) blockCenters.push([originX + c * pitch + block / 2, originZ + r * pitch + block / 2]);
  }
  return {
    pitch,
    block,
    street,
    roadsX,
    roadsZ,
    blockCenters,
    extent: { minX: roadsX[0]! - street / 2, maxX: roadsX.at(-1)! + street / 2, minZ: roadsZ[0]! - street / 2, maxZ: roadsZ.at(-1)! + street / 2 },
  };
}
