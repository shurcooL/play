package main

import (
	"runtime"

	"github.com/ajhager/webgl"
	glfw "github.com/shurcooL/glfw3"
)

var gl *webgl.Context

func init() {
	runtime.LockOSThread()
}

func main() {
	err := glfw.Init()
	if err != nil {
		panic(err)
	}
	defer glfw.Terminate()

	gl = webgl.NewContext()

	window, err := glfw.CreateWindow(400, 400, "Testing", nil, nil)
	if err != nil {
		panic(err)
	}

	window.MakeContextCurrent()

	gl.ClearColor(0.8, 0.3, 0.01, 1)

	for !window.ShouldClose() {
		// Do OpenGL stuff
		gl.Clear(gl.COLOR_BUFFER_BIT)

		window.SwapBuffers()
		glfw.PollEvents()
	}
}
