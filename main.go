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
	//"github.com/go-gl/glfw"
	glfw "github.com/tapir/glfw3-go"

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

func main() {
	runtime.LockOSThread()

	glfw.SetErrorCallback(func(err glfw.ErrorCode, desc string) {
		panic(fmt.Sprintf("%v: %v\n", err, desc))
	})

	if !glfw.Init() {
		panic("glfw.Init()")
	}
	defer glfw.Terminate()

	//glfw.OpenWindowHint(glfw.FsaaSamples, 32)
	glfw.WindowHint(glfw.ContextVersionMajor, 3)
	glfw.WindowHint(glfw.ContextVersionMinor, 2)
	glfw.WindowHint(glfw.OpenglForwardCompatible, gl.TRUE)
	glfw.WindowHint(glfw.OpenglProfile, glfw.OpenglCoreProfile)
	window, err := glfw.CreateWindow(400, 400, "", nil, nil)
	CheckError(err)
	window.MakeContextCurrent()

	fmt.Println("glfw.OpenGLCoreProfile:", glfw.OpenglCoreProfile == window.GetAttribute(glfw.OpenglProfile))

	err = gl.Init()
	if (nil != err) {
		log.Print(err)
	}

	fmt.Println(gl.GoStringUb(gl.GetString(gl.VENDOR)), gl.GoStringUb(gl.GetString(gl.RENDERER)), gl.GoStringUb(gl.GetString(gl.VERSION)))

	window.SetPosition(1600, 600)
	//glfw.SetWindowPos(1200, 300)
	glfw.SwapInterval(1)

	redraw := true

	size := func(w *glfw.Window, width, height int) {
		fmt.Println("Framebuffer Size:", width, height)
		gl.Viewport(0, 0, gl.Sizei(width), gl.Sizei(height))

		// Update the projection matrix
		/*gl.MatrixMode(gl.PROJECTION)
		gl.LoadIdentity()
		gl.Ortho(0, float64(width), float64(height), 0, -1, 1)
		gl.MatrixMode(gl.MODELVIEW)*/

		redraw = true
	}
	window.SetFramebufferSizeCallback(size)
	width, height := window.GetFramebufferSize()
	size(window, width, height)

	MousePos := func(w *glfw.Window, x, y float64) {
		redraw = true
		//fmt.Println("MousePos:", x, y)
	}
	window.SetCursorPositionCallback(MousePos)

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

	vao := createObject(vertices)

	for !window.ShouldClose() && glfw.Press != window.GetKey(glfw.KeyEscape) {
		//glfw.WaitEvents()
		glfw.PollEvents()

		if redraw {
			redraw = false

			gl.Clear(gl.COLOR_BUFFER_BIT)

			gl.UseProgram(programID)
			gl.BindVertexArray(vao)
			gl.DrawArrays(gl.TRIANGLES, 0, gl.Sizei(len(vertices)))
			gl.BindVertexArray(0)

			window.SwapBuffers()
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