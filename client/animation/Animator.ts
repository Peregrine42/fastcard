import { Animation } from "./Animation"

export class Animator {
    animations: Animation[] = []
    running = false

    frame(currentTime: number): void {
        this.animations.forEach((ani) => {
            if (ani.endValue === null || ani.startValue === null) throw new Error("Animation start and end are null")
            if (ani.startTime === null || typeof ani.startTime === "undefined") ani.startTime = currentTime
            if ((typeof (ani.elapsedTime) !== "undefined") && (ani.elapsedTime < ani.duration)) {
                ani.elapsedTime = currentTime - ani.startTime
                const currentValue = Math.floor((ani.elapsedTime / ani.duration) * (ani.endValue - ani.startValue))
                if (ani.callback) ani.callback(ani, currentValue)
            } else {
                if (ani.callback) ani.callback(ani, ani.endValue)
                ani.startTime = null;
                ani.startValue = null;
                ani.endValue = null;
                ani.duration = 0;
                if (ani.done) ani.done()
            }
        })

        this.animations = this.animations.filter(ani => ani.startTime !== null)

        if (this.animations.length > 0) {
            window.requestAnimationFrame((time) => this.frame(time));
        }
    }

    start(ani: Animation): void {
        this.animations.push(ani)
        if (!this.running) {
            window.requestAnimationFrame((time) => {
                this.frame(time)
            })
        }
    }
}
