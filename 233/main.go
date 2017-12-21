// Play with rendering eX0 player with CanvasRenderingContext2D API.
package main

import (
	"math"

	"honnef.co/go/js/dom"
)

var document = dom.GetWindow().Document().(dom.HTMLDocument)

func main() {
	document.AddEventListener("DOMContentLoaded", false, func(dom.Event) {
		paintPlayer(document.GetElementByID("player").(*dom.HTMLCanvasElement).GetContext2d())
		paintBullet(document.GetElementByID("bullet").(*dom.HTMLCanvasElement).GetContext2d())
	})
}

func paintPlayer(ctx *dom.CanvasRenderingContext2D) {
	ctx.SetTransform(10, 0, 0, 10, 160, 160)
	ctx.Rotate(-1.2)

	// Shadow.
	gradient := ctx.CreateRadialGradient(0, 0, 8*1.75, 0, 0, 0)
	gradient.AddColorStop(0, "rgba(0, 0, 0, 0)")
	gradient.AddColorStop(1, "rgba(0, 0, 0, 0.3)")
	ctx.Set("fillStyle", gradient)
	ctx.Ellipse(0, 0, 8*1.75, 8*1.75, 0, 0, Tau, false)
	ctx.Fill()

	// Gun.
	ctx.FillStyle = "red"
	ctx.FillRect(2, -1, 11, 2)

	// Body.
	ctx.BeginPath()
	ctx.StrokeStyle = "red"
	ctx.LineWidth = 2
	ctx.Ellipse(0, 0, 7, 7, Tau*1/12, 0, Tau*10/12, false)
	ctx.Stroke()
}

func paintBullet(ctx *dom.CanvasRenderingContext2D) {
	ctx.SetTransform(10, 0, 0, 10, 160, 160)
	ctx.Rotate(-0.4)

	gradient := ctx.CreateLinearGradient(-10, 0, 10, 0)
	gradient.AddColorStop(0, "rgba(100%, 100%, 0%, 0.2)")
	gradient.AddColorStop(1, "rgba(100%, 65%, 0%, 0.4)")
	ctx.Set("fillStyle", gradient)
	ctx.FillRect(-10, -1, 20, 2)
}

// Tau is the constant τ, which equals to 6.283185... or 2π.
// Reference: https://oeis.org/A019692
const Tau = 2 * math.Pi
