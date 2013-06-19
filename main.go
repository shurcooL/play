package main

import (
	"fmt"
	"log"
	. "gist.github.com/5286084.git"
	"time"
	"runtime"
	"unsafe"

	//"github.com/go-gl/gl"
	gl "github.com/chsc/gogl/gl33"
	"github.com/go-gl/glfw"

	"github.com/shurcooL/go-goon"

	"github.com/Ysgard/GoGLutils"
)

var _ = goon.Dump

var updated bool

/*var vertices = [][2]gl.Float{
	{0, 0},
	{300, 0},
	{300, 100},
	{0, 100},
}*/
var vertices = [][2]gl.Float{
	{-0.5, -0.5},
	{0.5, -0.5},
	{0.0, 0.5},
}

/*func DrawSomething() {
	gl.LoadIdentity()
	gl.Translatef(50, 100, 0)
	gl.Color3f(0, 0, 0)
	gl.Rectf(0, 0, 300, 100)
	if !updated {
		gl.Color3f(1, 1, 1)
	} else {
		gl.Color3f(0, 1, 0)
	}
	gl.Rectf(0 + 1, 0 + 1, 300 - 1, 100 - 1)
}

func DrawSpinner(spinner int) {
	gl.LoadIdentity()
	gl.Color3f(0, 0, 0)
	gl.Translatef(30, 30, 0)
	gl.Rotatef(float32(spinner), 0, 0, 1)
	//gl.Rotatef(gl.Float(spinner), 0, 0, 1)
	gl.Begin(gl.LINES)
	gl.Vertex2i(0, 0)
	gl.Vertex2i(0, 20)
	gl.End()
}*/

func main() {
	runtime.LockOSThread()

	err := glfw.Init()
	CheckError(err)
	defer glfw.Terminate()

	//glfw.OpenWindowHint(glfw.FsaaSamples, 32)
	glfw.OpenWindowHint(glfw.OpenGLVersionMajor, 3)
	glfw.OpenWindowHint(glfw.OpenGLVersionMinor, 2)
	glfw.OpenWindowHint(glfw.OpenGLProfile, glfw.OpenGLCoreProfile)
	err = glfw.OpenWindow(400, 400, 0, 0, 0, 0, 0, 0, glfw.Windowed)
	CheckError(err)

	fmt.Println("glfw.OpenGLCoreProfile:", glfw.OpenGLCoreProfile == glfw.WindowParam(glfw.OpenGLProfile))

	err = gl.Init()
	if (nil != err) {
		log.Print(err)
	}

	fmt.Println(gl.GoStringUb(gl.GetString(gl.VENDOR)), gl.GoStringUb(gl.GetString(gl.RENDERER)), gl.GoStringUb(gl.GetString(gl.VERSION)))

	glfw.SetWindowPos(1600, 600)
	//glfw.SetWindowPos(1200, 300)
	glfw.SetSwapInterval(1)
	glfw.Disable(glfw.AutoPollEvents)

	size := func(width, height int) {
		fmt.Println("screen size:", width, height)
		gl.Viewport(0, 0, gl.Sizei(width), gl.Sizei(height))

		// Update the projection matrix
		/*gl.MatrixMode(gl.PROJECTION)
		gl.LoadIdentity()
		gl.Ortho(0, float64(width), float64(height), 0, -1, 1)
		gl.MatrixMode(gl.MODELVIEW)*/
	}
	glfw.SetWindowSizeCallback(size)

	redraw := true

	MousePos := func(x, y int) {
		redraw = true
		//fmt.Println("MousePos:", x, y)
	}
	glfw.SetMousePosCallback(MousePos)

	// Load Shaders
	var programID gl.Uint = goglutils.CreateShaderProgram([]string{"/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/Ysgard/opengl-go-tut/shaders/simple_vertex_shader.vert",
																   "/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/Ysgard/opengl-go-tut/shaders/simple_fragment_shader.frag"})
	gl.ValidateProgram(programID)
	var validationErr gl.Int
	gl.GetProgramiv(programID, gl.VALIDATE_STATUS, &validationErr)
	if validationErr == gl.FALSE {
		log.Print("Shader program failed validation!")
	}

	go func() {
		<-time.After(10 * time.Second)
		log.Println("trigger!")
		updated = true
		redraw = true
	}()

	//gl.ClearColor(0.8, 0.3, 0.01, 1)

	//var spinner int

	/*in := make(chan int)
	out := make(chan int)
	go func(in, out chan int) {
		for {
			<-in
			println("in goroutine")
			out <- 0
		}
	}(in, out)*/

	vao := createObject(vertices)

	for gl.TRUE == glfw.WindowParam(glfw.Opened) &&
		glfw.KeyPress != glfw.Key(glfw.KeyEsc) {
		//in <- 0
		//glfw.WaitEvents()
		glfw.PollEvents()
		//println("glfw.WaitEvents()")
		//<-out

		if redraw {
			redraw = false

			gl.Clear(gl.COLOR_BUFFER_BIT)

			/*DrawSpinner(spinner)
			spinner++

			DrawSomething()*/

			gl.UseProgram(programID)
			gl.BindVertexArray(vao)
			gl.DrawArrays(gl.TRIANGLES, 0, gl.Sizei(len(vertices)))
			gl.BindVertexArray(0)

			glfw.SwapBuffers()
			log.Println("swapped buffers")
		} else {
			time.Sleep(time.Millisecond)
		}

		//runtime.Gosched()
	}
}

func createObject(vertices [][2]gl.Float) gl.Uint {
	var vao gl.Uint
	gl.GenVertexArrays(1, &vao)
	gl.BindVertexArray(vao)
	defer gl.BindVertexArray(0)

	var vbo gl.Uint
	gl.GenBuffers(1, &vbo)
	gl.BindBuffer(gl.ARRAY_BUFFER, vbo)
	defer gl.BindBuffer(gl.ARRAY_BUFFER, 0)

	gl.BufferData(gl.ARRAY_BUFFER, gl.Sizeiptr(int(unsafe.Sizeof([2]gl.Float{}))*len(vertices)), gl.Pointer(&vertices[0]), gl.STATIC_DRAW)

	gl.VertexAttribPointer(0, 2, gl.FLOAT, gl.FALSE, 0, nil)
	gl.EnableVertexAttribArray(0)

	return vao
}