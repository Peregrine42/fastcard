export interface ServerEntity {
    id: number
    x: number
    y: number
    details: {
        z?: number
        type?: string
    }
}