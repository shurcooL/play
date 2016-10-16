// Play with OpenGL 4.1.
package main

import (
	"fmt"
	"log"
	"runtime"
	"strings"
	"unsafe"

	//"github.com/go-gl/gl"
	//gl "github.com/chsc/gogl/gl33"
	//gl "github.com/err/gl33"
	"github.com/go-gl/gl/v4.1-core/gl"
	"github.com/go-gl/glfw/v3.2/glfw"

	//"github.com/Ysgard/GoGLutils"
	"github.com/go-gl/mathgl/mgl32"
)

var updated bool

var pMatrixUniform, mvMatrixUniform int32

var vertices = [][3]float32{
	{0, 0, 0},
	//{300, 0},
	{300, 100, 0},
	{0, 100, 0},
}

var programID uint32

/*var vertices = [][2]gl.Float{
	{-0.5, -0.5},
	{0.5, -0.5},
	{0.0, 0.5},
}*/

func CheckCoreProfile(window *glfw.Window) {
	openGlProfile := window.GetAttrib(glfw.OpenGLProfile)
	fmt.Println("glfw.OpenGLCoreProfile:", glfw.OpenGLCoreProfile == openGlProfile)
}

func checkGLError() {
	err := gl.GetError()
	if err != 0 {
		panic(fmt.Errorf("GL error: %v", err))
	}
}

func ValidateProgram(programID uint32) {
	gl.ValidateProgram(programID)

	var validationErr int32
	gl.GetProgramiv(programID, gl.VALIDATE_STATUS, &validationErr)
	if validationErr == gl.FALSE {
		log.Print("Shader program failed validation!")

		var infoLogLength int32
		gl.GetProgramiv(programID, gl.INFO_LOG_LENGTH, &infoLogLength)
		if infoLogLength > 0 {
			programErrorMsg := strings.Repeat("\x00", int(infoLogLength+1))

			gl.GetProgramInfoLog(programID, int32(infoLogLength), nil, gl.Str(programErrorMsg))
			fmt.Printf("Program Info: %s\n", programErrorMsg)
		}
	}
}

func glDebugCallback(
	source uint32,
	gltype uint32,
	id uint32,
	severity uint32,
	length int32,
	message string,
	userParam unsafe.Pointer) {
	fmt.Printf("Debug source=%d type=%d severity=%d: %s\n", source, gltype, severity, message)
}

func main() {
	runtime.LockOSThread()

	if err := glfw.Init(); err != nil {
		log.Println(err)
	}
	defer glfw.Terminate()

	//glfw.OpenWindowHint(glfw.FsaaSamples, 32)
	glfw.WindowHint(glfw.ContextVersionMajor, 4)
	glfw.WindowHint(glfw.ContextVersionMinor, 1)
	glfw.WindowHint(glfw.OpenGLForwardCompatible, gl.TRUE)
	glfw.WindowHint(glfw.OpenGLProfile, glfw.OpenGLCoreProfile)
	window, err := glfw.CreateWindow(400, 400, "", nil, nil)
	if err != nil {
		panic(err)
	}
	window.MakeContextCurrent()

	err = gl.Init()
	if nil != err {
		log.Println(err)
	}
	fmt.Println(gl.GoStr(gl.GetString(gl.VENDOR)), gl.GoStr(gl.GetString(gl.RENDERER)), gl.GoStr(gl.GetString(gl.VERSION)))

	// Query the extensions to determine if we can enable the debug callback
	var numExtensions int32
	gl.GetIntegerv(gl.NUM_EXTENSIONS, &numExtensions)

	extensions := make(map[string]bool)
	for i := int32(0); i < numExtensions; i++ {
		extension := gl.GoStr(gl.GetStringi(gl.EXTENSIONS, uint32(i)))
		extensions[extension] = true
	}

	if _, ok := extensions["GL_ARB_debug_output"]; ok {
		gl.Enable(gl.DEBUG_OUTPUT_SYNCHRONOUS_ARB)
		gl.DebugMessageCallbackARB(gl.DebugProc(glDebugCallback), gl.Ptr(nil))
	}

	//window.SetPosition(1600, 600)
	window.SetPos(1200, 300)
	glfw.SwapInterval(1)

	redraw := true

	var pMatrix mgl32.Mat4
	mvMatrix := mgl32.Translate3D(50, 100, 0)

	size := func(w *glfw.Window, width, height int) {
		fmt.Println("Framebuffer Size:", width, height)
		windowWidth, windowHeight := w.GetSize()
		fmt.Println("Window Size:", windowWidth, windowHeight)
		gl.Viewport(0, 0, int32(width), int32(height))

		// Update the projection matrix
		pMatrix = mgl32.Ortho2D(0, float32(windowWidth), float32(windowHeight), 0)

		redraw = true
	}
	window.SetFramebufferSizeCallback(size)
	width, height := window.GetFramebufferSize()
	size(window, width, height)

	MousePos := func(w *glfw.Window, x, y float64) {
		redraw = true
		//fmt.Println("MousePos:", x, y)

		mvMatrix = mgl32.Translate3D(float32(x), float32(y), 0)
	}
	window.SetCursorPosCallback(MousePos)

	// Load Shaders
	programID = CreateShaderProgram([]string{
		"simple_vertex_shader.vert",
		"simple_fragment_shader.frag",
	})

	ValidateProgram(programID)

	gl.UseProgram(programID)

	pMatrixUniform = gl.GetUniformLocation(programID, gl.Str("uPMatrix\x00"))
	mvMatrixUniform = gl.GetUniformLocation(programID, gl.Str("uMVMatrix\x00"))

	vao := createObject(vertices)
	_ = vao
	//gl.BindVertexArray(vao)

	gl.ClearColor(0.8, 0.3, 0.01, 1)

	for !window.ShouldClose() && glfw.Press != window.GetKey(glfw.KeyEscape) {
		glfw.WaitEvents()

		if redraw {
			redraw = false

			gl.Clear(gl.COLOR_BUFFER_BIT)

			gl.BindBuffer(gl.ARRAY_BUFFER, vbo)
			gl.UniformMatrix4fv(pMatrixUniform, 1, false, &pMatrix[0])
			gl.UniformMatrix4fv(mvMatrixUniform, 1, false, &mvMatrix[0])
			//gl.BindVertexArray(vao)
			gl.DrawArrays(gl.TRIANGLE_FAN, 0, int32(len(vertices)))
			//gl.BindVertexArray(0)

			window.SwapBuffers()
			//log.Println("swapped buffers")
			checkGLError()
		}

		runtime.Gosched()
	}
}

var vbo uint32

func createObject(vertices [][3]float32) uint32 {
	var vao uint32
	gl.GenVertexArrays(1, &vao)
	gl.BindVertexArray(vao)
	//defer gl.BindVertexArray(0)

	gl.GenBuffers(1, &vbo)
	gl.BindBuffer(gl.ARRAY_BUFFER, vbo)
	//defer gl.BindBuffer(gl.ARRAY_BUFFER, 0)

	gl.BufferData(gl.ARRAY_BUFFER, int(unsafe.Sizeof([3]float32{}))*len(vertices), gl.Ptr(vertices), gl.STATIC_DRAW)

	vertexPositionAttribute := uint32(gl.GetAttribLocation(programID, gl.Str("aVertexPosition\x00")))
	gl.EnableVertexAttribArray(vertexPositionAttribute)
	gl.VertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, nil)

	return vao
}
