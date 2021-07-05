export interface NudgedTransform {
    translateBy: (x: number, y: number) => NudgedTransform
    rotateBy: (value: number, point: number[]) => NudgedTransform
    multiplyBy: (transform: NudgedTransform) => NudgedTransform
    inverse: () => NudgedTransform
    toArray: () => number[]
    transform: (point: [number, number]) => [number, number]
    getMatrix: () => { a: number, b: number, c: number, d: number, e: number, f: number }
}
