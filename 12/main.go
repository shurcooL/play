// +build js

// Play with WebGL using GopherJS.
package main

import (
	"fmt"

	"github.com/gopherjs/gopherjs/js"
	"github.com/gopherjs/webgl"
)

var mouse [2]int
var debug js.Object

func Tick() {
	debug.Set("textContent", fmt.Sprintln("mouse:", mouse))

	js.Global.Call("requestAnimationFrame", Tick)
}

func handleMouseMove(event js.Object) {
	mouse[0] = event.Get("clientX").Int()
	mouse[1] = event.Get("clientY").Int()
}

func main() {
	document := js.Global.Get("document")
	canvas := document.Call("createElement", "canvas")
	document.Get("body").Call("appendChild", canvas)

	attrs := webgl.DefaultAttributes()
	attrs.Alpha = false

	gl, err := webgl.NewContext(canvas, attrs)
	if err != nil {
		js.Global.Call("alert", "Error: "+err.Error())
	}

	gl.ClearColor(0.8, 0.3, 0.01, 1)
	gl.Clear(gl.COLOR_BUFFER_BIT)

	debug = document.Call("createElement", "div")
	document.Get("body").Call("appendChild", debug)

	document.Set("onmousemove", handleMouseMove)

	js.Global.Call("requestAnimationFrame", Tick)
}
