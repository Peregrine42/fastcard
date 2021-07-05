import nudged from "nudged"
import { Animator } from "../animation/Animator";
import { Animation } from "../animation/Animation";
import { NudgedPanZoomRotateTouch } from "./NudgedPanZoomRotateTouch";
import { NudgedPanZoomRotateTouchDiff } from "./NudgedPanZoomRotateTouchDiff";
import { NudgedTransform } from "./NudgedTransform";
import { NudgedMatrix } from "./NudgedMatrix";

export class NudgedPanZoomRotate {
    currentTransform: NudgedTransform
    beforeDragTransform: NudgedTransform
    animationStartTransform: NudgedTransform;
    startPanX = 0
    startPanY = 0
    startTouches: NudgedPanZoomRotateTouch[] = []
    panning = false
    pointers: { [identifier: string]: NudgedPanZoomRotateTouchDiff } = {}
    committedTransform?: NudgedTransform
    animationDurationStep = 150; // in miliseconds
    animationDuration = 0;
    startValue: null | number = null
    endValue: null | number = null
    startTime: null | number = null
    animator: Animator
    animationCallback?: (currentValue: number) => void
    onTransform?: () => void

    initState(): { transform: NudgedMatrix } {
        return {
            transform: nudged.Transform.IDENTITY.getMatrix()
        }
    }

    getMatrix(): NudgedMatrix {
        if (this.currentTransform) {
            return this.currentTransform.getMatrix()
        } else {
            return nudged.Transform.IDENTITY.getMatrix()
        }
    }

    transform([x, y]: [number, number]): [number, number] {
        if (!this.currentTransform) return [x, y]
        return this.currentTransform.transform([x, y])
    }

    constructor(animator: Animator) {
        this.animator = animator
        this.currentTransform = nudged.Transform.IDENTITY
        this.beforeDragTransform = nudged.Transform.IDENTITY
        this.animationStartTransform = nudged.Transform.IDENTITY
        this.sync()
    }

    setTransformCallback(onTransform: () => void): void {
        this.onTransform = onTransform
    }

    setTransform(transformArray: [number, number] | null): void {
        if (!transformArray) this.currentTransform = nudged.Transform.IDENTITY
        else {
            this.currentTransform = nudged.createFromArray(transformArray)
        }
        this.sync()
    }

    onAnimationFrame(callback: () => void): void {
        this.animationCallback = callback;
    }

    animateRotation(ani: Animation, currentValue: number): void {
        const startState = (ani.startState as { transform: NudgedTransform })
        this.currentTransform = startState.transform.rotateBy(
            currentValue * Math.PI / 180, [0, 0]
        )

        this.sync()

        if (this.animationCallback) this.animationCallback(currentValue)
    }

    sync(): void {
        this.committedTransform = nudged.createFromArray(this.currentTransform.toArray())
        if (this.onTransform) this.onTransform()
    }

    startPan(e: {
        clientX: number,
        clientY: number
    }): void {
        this.startPanX = e.clientX
        this.startPanY = e.clientY
        this.beforeDragTransform = nudged.createFromArray(
            this.currentTransform.toArray()
        )
        this.panning = true
    }

    continuePan(e: {
        clientX: number,
        clientY: number
    }): void {
        if (!this.panning) return
        this.currentTransform = this.beforeDragTransform.translateBy(
            e.clientX - this.startPanX,
            e.clientY - this.startPanY
        )
        this.sync()
    }

    endPan(): void {
        this.panning = false
        this.sync()
    }

    onWheel(e: {
        deltaY: number,
        clientX: number,
        clientY: number
    }): void {
        const direction = e.deltaY > 0 ? 1.1 : 0.9
        if (this.currentTransform) {
            const [x, y] = this.currentTransform.inverse().transform([e.clientX - (innerWidth / 2), e.clientY - (innerHeight / 2)])
            const newTransform = nudged.Transform.IDENTITY.scaleBy(direction, [x, y])
            this.currentTransform = this.currentTransform.multiplyBy(newTransform)
        }

        this.sync()
    }

    async rotate(): Promise<void> {
        return new Promise<void>(res => {
            const currentAni = this.animator.animations.find(ani => ani.name === "view-rotate")
            if (currentAni) {
                if (currentAni.endValue === null) {
                    currentAni.endValue = 45
                    currentAni.duration = this.animationDurationStep;
                } else {
                    currentAni.endValue += 45
                    currentAni.duration += this.animationDurationStep;
                }
            } else {
                if (!this.currentTransform) return
                this.animator.start({
                    elapsedTime: 0,
                    duration: this.animationDurationStep,
                    startValue: 0,
                    endValue: 45,
                    name: "view-rotate",
                    startState: {
                        transform: nudged.createFromArray(this.currentTransform.toArray())
                    },
                    callback: (ani: Animation, currentValue: number) => this.animateRotation(ani, currentValue),
                    done: res
                })
            }
        })
    }

    touchDragStart(touches: NudgedPanZoomRotateTouch[]): void {
        this.startTouches = touches.map(t => { return { ...t } }).sort((a, b) => {
            if (a.identifier < b.identifier) {
                return -1
            } else {
                return 1
            }
        })
        if (this.beforeDragTransform && this.currentTransform) {
            this.beforeDragTransform = nudged.createFromArray(this.currentTransform.toArray())
        }
        this.panning = true
    }

    touchDrag(touches: { identifier: number, clientX: number, clientY: number }[]): void {
        const domain = this.startTouches.map(t => [t.clientX, t.clientY])
        touches.sort((a, b) => {
            if (a.identifier < b.identifier) {
                return -1
            } else {
                return 1
            }
        })
        const range = touches.map(t => [t.clientX, t.clientY])
        if (this.currentTransform) {
            this.currentTransform = this.currentTransform.multiplyBy(nudged.estimate("TS", domain, range))
        }
        this.startTouches = touches.map(t => { return { ...t } }).sort((a, b) => {
            if (a.identifier < b.identifier) {
                return -1
            } else {
                return 1
            }
        })
        this.sync()
    }

    startTouch(id: number, x: number, y: number): void {
        this.commit()
        this.pointers[id] = { dx: x, dy: y, rx: x, ry: y }
        this.updateTransform()
    }

    continueTouch(id: number, x: number, y: number): void {
        if (this.pointers[id]) {
            this.pointers[id].rx = x
            this.pointers[id].ry = y
            this.updateTransform()
        }
    }

    endTouch(id: number): void {
        this.commit()
        delete this.pointers[id]
    }

    commit(): void {
        // Move ongoing transformation to the committed transformation so that
        // the total transformation stays the same.

        // Commit ongoingTransformation. As a result
        // the domain and range of all pointers become equal.
        const domain = []
        const range = []
        for (const id in this.pointers) {
            if (this.pointers[id]) {
                const p = this.pointers[id]
                domain.push([p.dx, p.dy])
                range.push([p.rx, p.ry]) // copies
                // Move transformation from current pointers;
                // Turn ongoingTransformation to identity.
                p.dx = p.rx
                p.dy = p.ry
            }
        }
        // Calculate the transformation to commit and commit it by
        // combining it with the previous transformations. Total transform
        // then becomes identical with the commited ones.
        const t = nudged.estimateTS(domain, range)
        this.committedTransform = t.multiplyBy(this.committedTransform)
        this.sync()
    }

    updateTransform(): void {
        // Calculate the total transformation from the committed transformation
        // and the points of the ongoing transformation.

        let id: string
        const domain = []
        const range = []
        for (id in this.pointers) {
            if (this.pointers[id]) {
                const p = this.pointers[id]
                domain.push([p.dx, p.dy])
                range.push([p.rx, p.ry])
            }
        }
        // Calculate ongoing transform and combine it with the committed.
        const t = nudged.estimateTS(domain, range)
        this.currentTransform = t.multiplyBy(this.committedTransform)
    }
}
