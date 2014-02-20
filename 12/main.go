package main

import (
	//"fmt"

	"github.com/gopherjs/webgl"
	"github.com/neelance/gopherjs/js"
)

func tick() {
	println("Tick.")
}

func main() {
	//fmt.Println("Hello, playground")
	js.Global("alert").Invoke("Hello, JavaScript")
	println("Hello, JS console")

	document := js.Global("document")
	canvas := document.Call("createElement", "canvas")
	document.Get("body").Call("appendChild", canvas)

	attrs := webgl.DefaultAttributes()
	attrs.Alpha = false

	gl, err := webgl.NewContext(canvas, attrs)
	if err != nil {
		panic(err)
	}

	gl.ClearColor(0.8, 0.3, 0.01, 1)
	gl.Clear(webgl.COLOR_BUFFER_BIT)

	js.Global("window").Call("requestAnimationFrame", `go$packages["main"].tick`)
}
