// Play with rendering to a 2D canvas at 60 fps.
package main

import (
	"math"
	"time"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {
	document.AddEventListener("DOMContentLoaded", false, func(dom.Event) {
		go paint()
	})
}

func paint() {
	var canvas = document.GetElementByID("canvas").(*dom.HTMLCanvasElement)
	canvas.Width, canvas.Height = 640, 640

	var ctx = canvas.GetContext2d()
	ctx.SetTransform(1, 0, 0, 1, 320, 320)

	ctx.FillStyle = "green"

	i := 0
	var t0 time.Duration
	var x func(time.Duration)
	x = func(t time.Duration) {
		_ = t - t0 //fmt.Println(t - t0)
		t0 = t

		ctx.ClearRect(-320, -320, 640, 640)

		ctx.BeginPath()
		ctx.Ellipse(250*math.Cos(float64(i)*Tau/100), 250*math.Sin(float64(i)*Tau/100), 10, 10, 0, 0, Tau, false)
		ctx.Fill()
		i += 1

		dom.GetWindow().RequestAnimationFrame(x)
	}

	dom.GetWindow().RequestAnimationFrame(x)
}

// Tau is the constant τ, which equals to 6.283185... or 2π.
// Reference: https://oeis.org/A019692
const Tau = 2 * math.Pi
