package main

import (
	"fmt"
	"log"
	"runtime"
	"time"
	"unsafe"

	. "gist.github.com/5286084.git"

	//"github.com/go-gl/gl"
	gl "github.com/chsc/gogl/gl33"
	glfw "github.com/go-gl/glfw3"

	"github.com/shurcooL/go-goon"

	"github.com/Jragonmiris/mathgl"
	"github.com/Ysgard/GoGLutils"
)

var _ = goon.Dump

var updated bool

var pMatrixUniform, mvMatrixUniform gl.Int

var vertices = [][2]gl.Float{
	{0, 0},
	{300, 0},
	{300, 100},
	{0, 100},
}

/*var vertices = [][2]gl.Float{
	{-0.5, -0.5},
	{0.5, -0.5},
	{0.0, 0.5},
}*/

func CheckCoreProfile(window *glfw.Window) {
	fmt.Println("glfw.OpenGLCoreProfile:", glfw.OpenglCoreProfile == window.GetAttribute(glfw.OpenglProfile))
}

func CheckGLError() {
	errorCode := gl.GetError()
	if 0 != errorCode {
		log.Panic("GL Error: ", errorCode)
	}
}

func ValidateProgram(programID gl.Uint) {
	gl.ValidateProgram(programID)

	var validationErr gl.Int
	gl.GetProgramiv(programID, gl.VALIDATE_STATUS, &validationErr)
	if validationErr == gl.FALSE {
		log.Print("Shader program failed validation!")
	}

	var infoLogLength gl.Int
	gl.GetProgramiv(programID, gl.INFO_LOG_LENGTH, &infoLogLength)
	if infoLogLength > 0 {
		programErrorMsg := gl.GLStringAlloc(gl.Sizei(infoLogLength))
		gl.GetProgramInfoLog(programID, gl.Sizei(infoLogLength), nil, programErrorMsg)
		fmt.Printf("Program Info: %s\n", gl.GoString(programErrorMsg))
	}
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

	err = gl.Init()
	if nil != err {
		log.Print(err)
	}
	fmt.Println(gl.GoStringUb(gl.GetString(gl.VENDOR)), gl.GoStringUb(gl.GetString(gl.RENDERER)), gl.GoStringUb(gl.GetString(gl.VERSION)))

	//window.SetPosition(1600, 600)
	window.SetPosition(1200, 300)
	glfw.SwapInterval(1)

	redraw := true

	var pMatrix mathgl.Mat4f
	mvMatrix := mathgl.Translate3D(50, 100, 0)

	size := func(w *glfw.Window, width, height int) {
		fmt.Println("Framebuffer Size:", width, height)
		windowWidth, windowHeight := w.GetSize()
		fmt.Println("Window Size:", windowWidth, windowHeight)
		gl.Viewport(0, 0, gl.Sizei(width), gl.Sizei(height))

		// Update the projection matrix
		pMatrix = mathgl.Ortho2D(0, float32(windowWidth), float32(windowHeight), 0)

		redraw = true
	}
	window.SetFramebufferSizeCallback(size)
	width, height := window.GetFramebufferSize()
	size(window, width, height)

	MousePos := func(w *glfw.Window, x, y float64) {
		redraw = true
		//fmt.Println("MousePos:", x, y)

		mvMatrix = mathgl.Translate3D(float32(x), float32(y), 0)
	}
	window.SetCursorPositionCallback(MousePos)

	// Load Shaders
	var programID gl.Uint = goglutils.CreateShaderProgram([]string{
		"./GoLand/src/gist.github.com/5816852.git/simple_vertex_shader.vert",
		"./GoLand/src/gist.github.com/5816852.git/simple_fragment_shader.frag",
	})

	pMatrixUniform = gl.GetUniformLocation(programID, gl.GLString("uPMatrix"))
	mvMatrixUniform = gl.GetUniformLocation(programID, gl.GLString("uMVMatrix"))

	go func() {
		<-time.After(10 * time.Second)
		log.Println("trigger!")
		updated = true
		redraw = true
		glfw.PostEmptyEvent()
	}()

	gl.ClearColor(0.8, 0.3, 0.01, 1)

	vao := createObject(vertices)
	gl.BindVertexArray(vao)

	ValidateProgram(programID)

	for !window.ShouldClose() && glfw.Press != window.GetKey(glfw.KeyEscape) {
		glfw.WaitEvents()

		if redraw {
			redraw = false

			gl.Clear(gl.COLOR_BUFFER_BIT)

			gl.UseProgram(programID)
			gl.UniformMatrix4fv(pMatrixUniform, 1, gl.FALSE, (*gl.Float)(&pMatrix[0]))
			gl.UniformMatrix4fv(mvMatrixUniform, 1, gl.FALSE, (*gl.Float)(&mvMatrix[0]))
			gl.BindVertexArray(vao)
			gl.DrawArrays(gl.TRIANGLE_FAN, 0, gl.Sizei(len(vertices)))
			gl.BindVertexArray(0)

			window.SwapBuffers()
			log.Println("swapped buffers")
			CheckGLError()
		}

		runtime.Gosched()
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
