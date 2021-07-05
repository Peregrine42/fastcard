export interface Animation {
    name: string
    startValue: number | null
    endValue: number | null
    startTime?: number | null
    duration: number
    elapsedTime?: number
    startState: unknown
    callback?: (ani: Animation, currentValue: number) => void
    done?: () => void
}
