// WIP: Render a colored canvas using "golang.org/x/mobile/gl" package (with CL 8793 merged) and goxjs/glfw.
package main

import (
	"log"

	//"github.com/goxjs/gl" // "golang.org/x/mobile/gl" package fork (with CL 8793 merged).
	"github.com/goxjs/glfw"
)

// contextWatcher is this program's context watcher.
type contextWatcher struct {
	initGL bool
}

func (cw *contextWatcher) OnMakeCurrent(context interface{}) {
	if !cw.initGL {
		// Initialise gl bindings using the current context.
		/*err := gl.Init()
		if err != nil {
			log.Fatalln("gl.Init:", err)
		}*/
		log.Println("gl.Init() should happen here, etc.")
		cw.initGL = true
	}
}
func (contextWatcher) OnDetach() {}

var windowSize = [2]int{400, 400}

func main() {
	err := glfw.Init(&contextWatcher{})
	if err != nil {
		panic(err)
	}
	defer glfw.Terminate()

	//glfw.WindowHint(glfw.Samples, 8) // Anti-aliasing.
	window, err := glfw.CreateWindow(windowSize[0], windowSize[1], "Testing", nil, nil)
	if err != nil {
		panic(err)
	}
	window.MakeContextCurrent()

	//fmt.Printf("OpenGL: %s %s %s; %v samples.\n", gl.GetString(gl.VENDOR), gl.GetString(gl.RENDERER), gl.GetString(gl.VERSION), gl.GetInteger(gl.SAMPLES))
	//fmt.Printf("GLSL: %s.\n", gl.GetString(gl.SHADING_LANGUAGE_VERSION))

	//gl.ClearColor(0.8, 0.3, 0.01, 1)
	//gl.Clear(gl.COLOR_BUFFER_BIT)

	MousePos := func(_ *glfw.Window, x, y float64) {
		//mouseX, mouseY = x, y
	}
	window.SetCursorPosCallback(MousePos)

	framebufferSizeCallback := func(w *glfw.Window, framebufferSize0, framebufferSize1 int) {
		//gl.Viewport(0, 0, framebufferSize0, framebufferSize1)

		windowSize[0], windowSize[1] = w.GetSize()
	}
	{
		var framebufferSize [2]int
		framebufferSize[0], framebufferSize[1] = window.GetFramebufferSize()
		framebufferSizeCallback(window, framebufferSize[0], framebufferSize[1])
	}
	window.SetFramebufferSizeCallback(framebufferSizeCallback)

	for !window.ShouldClose() {
		//gl.Clear(gl.COLOR_BUFFER_BIT)

		//window.SwapBuffers()
		glfw.PollEvents()
	}
}
