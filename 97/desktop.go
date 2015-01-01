// +build !js

package main

import (
	"errors"
	"fmt"
	"math"

	"github.com/GlenKelley/go-collada"
	"github.com/bradfitz/iter"
	"github.com/go-gl/mathgl/mgl32"
	"github.com/go-gl/mathgl/mgl64"
	"github.com/shurcooL/go-goon"
	"github.com/shurcooL/goglfw"
	"github.com/shurcooL/webgl"
)

var gl *webgl.Context

const (
	vertexSource = `#version 120

attribute vec3 aVertexPosition;
//attribute vec3 aVertexColor;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

varying vec3 aPixelColor;

void main() {
	//aPixelColor = aVertexColor;
	aPixelColor = vec3(1.0, 1.0, 1.0);
	gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
}
`
	fragmentSource = `#version 120

//precision lowp float;

varying vec3 aPixelColor;

void main() {
	gl_FragColor = vec4(aPixelColor, 1.0);
}
`
)

var program *webgl.Program
var pMatrixUniform *webgl.UniformLocation
var mvMatrixUniform *webgl.UniformLocation

var mvMatrix mgl32.Mat4
var pMatrix mgl32.Mat4

func initShaders() error {
	vertexShader := gl.CreateShader(gl.VERTEX_SHADER)
	gl.ShaderSource(vertexShader, vertexSource)
	gl.CompileShader(vertexShader)
	defer gl.DeleteShader(vertexShader)

	fragmentShader := gl.CreateShader(gl.FRAGMENT_SHADER)
	gl.ShaderSource(fragmentShader, fragmentSource)
	gl.CompileShader(fragmentShader)
	defer gl.DeleteShader(fragmentShader)

	program = gl.CreateProgram()
	gl.AttachShader(program, vertexShader)
	gl.AttachShader(program, fragmentShader)
	gl.LinkProgram(program)

	if !gl.GetProgramParameterb(program, gl.LINK_STATUS) {
		return errors.New("LINK_STATUS")
	}

	gl.ValidateProgram(program)
	if !gl.GetProgramParameterb(program, gl.VALIDATE_STATUS) {
		return errors.New("VALIDATE_STATUS")
	}

	gl.UseProgram(program)

	pMatrixUniform = gl.GetUniformLocation(program, "uPMatrix")
	mvMatrixUniform = gl.GetUniformLocation(program, "uMVMatrix")

	if glError := gl.GetError(); glError != 0 {
		return fmt.Errorf("gl.GetError: %v", glError)
	}

	return nil
}

var doc *collada.Collada
var m_TriangleCount, m_LineCount int
var vertexVbo *webgl.Buffer
var normalVbo *webgl.Buffer

func loadModel() error {
	var err error
	doc, err = collada.LoadDocument("/Users/Dmitri/Dmitri/^Work/^GitHub/Slide/Models/unit_box.dae")
	//doc, err = collada.LoadDocument("/Users/Dmitri/Dmitri/^Work/^GitHub/Slide/Models/complex_shape.dae")
	if err != nil {
		return err
	}

	// Calculate the total triangle and line counts.
	for _, geometry := range doc.LibraryGeometries[0].Geometry {
		for _, triangle := range geometry.Mesh.Triangles {
			m_TriangleCount += triangle.HasCount.Count
		}
	}

	fmt.Printf("m_TriangleCount = %v, m_LineCount = %v\n", m_TriangleCount, m_LineCount)

	// ---

	vertices := make([]float32, 3*3*m_TriangleCount)
	goon.DumpExpr(len(vertices))

	nTriangleNumber := 0
	for _, geometry := range doc.LibraryGeometries[0].Geometry {
		pVertexData := geometry.Mesh.Source[0].FloatArray.F32()

		for _, triangles := range geometry.Mesh.Triangles {
			pVertexIndicies := triangles.HasP.P.I()
			sharedInput := len(triangles.HasSharedInput.Input)
			offset := 0 // HACK. 0 seems to be position, 1 is normal, but need to not hardcode this.

			for nTriangle := range iter.N(triangles.HasCount.Count) {
				vertices[3*3*nTriangleNumber+0] = pVertexData[3*pVertexIndicies[(3*nTriangle+0)*sharedInput+offset]+0]
				vertices[3*3*nTriangleNumber+1] = pVertexData[3*pVertexIndicies[(3*nTriangle+0)*sharedInput+offset]+1]
				vertices[3*3*nTriangleNumber+2] = pVertexData[3*pVertexIndicies[(3*nTriangle+0)*sharedInput+offset]+2]
				vertices[3*3*nTriangleNumber+3] = pVertexData[3*pVertexIndicies[(3*nTriangle+1)*sharedInput+offset]+0]
				vertices[3*3*nTriangleNumber+4] = pVertexData[3*pVertexIndicies[(3*nTriangle+1)*sharedInput+offset]+1]
				vertices[3*3*nTriangleNumber+5] = pVertexData[3*pVertexIndicies[(3*nTriangle+1)*sharedInput+offset]+2]
				vertices[3*3*nTriangleNumber+6] = pVertexData[3*pVertexIndicies[(3*nTriangle+2)*sharedInput+offset]+0]
				vertices[3*3*nTriangleNumber+7] = pVertexData[3*pVertexIndicies[(3*nTriangle+2)*sharedInput+offset]+1]
				vertices[3*3*nTriangleNumber+8] = pVertexData[3*pVertexIndicies[(3*nTriangle+2)*sharedInput+offset]+2]
				fmt.Printf("setting from %v to %v\n", 3*3*nTriangleNumber+0, 3*3*nTriangleNumber+8)
				fmt.Printf("vertex 0: %v %v %v\n", vertices[3*3*nTriangleNumber+0], vertices[3*3*nTriangleNumber+1], vertices[3*3*nTriangleNumber+2])
				fmt.Printf("vertex 1: %v %v %v\n", vertices[3*3*nTriangleNumber+3], vertices[3*3*nTriangleNumber+4], vertices[3*3*nTriangleNumber+5])
				fmt.Printf("vertex 2: %v %v %v\n", vertices[3*3*nTriangleNumber+6], vertices[3*3*nTriangleNumber+7], vertices[3*3*nTriangleNumber+8])

				nTriangleNumber++
			}
		}
	}

	// ---

	vertexVbo = createVbo3Float(vertices)

	if glError := gl.GetError(); glError != 0 {
		return fmt.Errorf("gl.GetError: %v", glError)
	}

	return nil
}

func createVbo3Float(vertices []float32) *webgl.Buffer {
	vbo := gl.CreateBuffer()
	gl.BindBuffer(gl.ARRAY_BUFFER, vbo)
	gl.BufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
	return vbo
}

func createVbo3Ubyte(vertices []uint8) *webgl.Buffer {
	vbo := gl.CreateBuffer()
	gl.BindBuffer(gl.ARRAY_BUFFER, vbo)
	gl.BufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
	return vbo
}

var windowSize = [2]int{1024, 800}

func main() {
	err := goglfw.Init()
	if err != nil {
		panic(err)
	}
	defer goglfw.Terminate()

	window, err := goglfw.CreateWindow(windowSize[0], windowSize[1], "Terrain", nil, nil)
	if err != nil {
		panic(err)
	}
	window.MakeContextCurrent()

	gl = window.Context

	framebufferSizeCallback := func(w *goglfw.Window, framebufferSize0, framebufferSize1 int) {
		gl.Viewport(0, 0, framebufferSize0, framebufferSize1)

		windowSize[0], windowSize[1], _ = w.GetSize()
	}
	{
		var framebufferSize [2]int
		framebufferSize[0], framebufferSize[1], _ = window.GetFramebufferSize()
		framebufferSizeCallback(window, framebufferSize[0], framebufferSize[1])
	}
	window.SetFramebufferSizeCallback(framebufferSizeCallback)

	var lastMousePos mgl64.Vec2
	lastMousePos[0], lastMousePos[1], _ = window.GetCursorPosition()
	//fmt.Println("initial:", lastMousePos)
	mousePos := func(w *goglfw.Window, x, y float64) {
		//fmt.Println("callback:", x, y)
		sliders := []float64{x - lastMousePos[0], y - lastMousePos[1]}
		//axes := []float64{x, y}

		lastMousePos[0] = x
		lastMousePos[1] = y

		{
			isButtonPressed := [2]bool{
				mustAction(window.GetMouseButton(goglfw.MouseButton1)) != goglfw.Release,
				mustAction(window.GetMouseButton(goglfw.MouseButton2)) != goglfw.Release,
			}

			var moveSpeed = 1.0
			const rotateSpeed = 0.3

			if mustAction(window.GetKey(goglfw.KeyLeftShift)) != goglfw.Release || mustAction(window.GetKey(goglfw.KeyRightShift)) != goglfw.Release {
				moveSpeed *= 0.01
			}

			if isButtonPressed[0] && !isButtonPressed[1] {
				camera.rh += rotateSpeed * sliders[0]
			} else if isButtonPressed[0] && isButtonPressed[1] {
				camera.x += moveSpeed * sliders[0] * math.Cos(mgl64.DegToRad(camera.rh))
				camera.y += -moveSpeed * sliders[0] * math.Sin(mgl64.DegToRad(camera.rh))
			} else if !isButtonPressed[0] && isButtonPressed[1] {
				camera.rh += rotateSpeed * sliders[0]
			}
			if isButtonPressed[0] && !isButtonPressed[1] {
				camera.x -= moveSpeed * sliders[1] * math.Sin(mgl64.DegToRad(camera.rh))
				camera.y -= moveSpeed * sliders[1] * math.Cos(mgl64.DegToRad(camera.rh))
			} else if isButtonPressed[0] && isButtonPressed[1] {
				camera.z -= moveSpeed * sliders[1]
			} else if !isButtonPressed[0] && isButtonPressed[1] {
				camera.rv -= rotateSpeed * sliders[1]
			}
			for camera.rh < 0 {
				camera.rh += 360
			}
			for camera.rh >= 360 {
				camera.rh -= 360
			}
			if camera.rv > 90 {
				camera.rv = 90
			}
			if camera.rv < -90 {
				camera.rv = -90
			}
			//fmt.Printf("Cam rot h = %v, v = %v\n", camera.rh, camera.rv)
		}
	}
	window.SetCursorPositionCallback(mousePos)

	err = initShaders()
	if err != nil {
		panic(err)
	}
	err = loadModel()
	if err != nil {
		panic(err)
	}

	gl.ClearColor(0.8, 0.3, 0.01, 1)
	gl.Enable(gl.DEPTH_TEST)

	for !mustBool(window.ShouldClose()) {
		gl.Clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

		//pMatrix = mgl32.Ortho2D(0, float32(windowSize[0]), float32(windowSize[1]), 0)
		pMatrix = mgl32.Perspective(mgl32.DegToRad(45), float32(windowSize[0])/float32(windowSize[1]), 0.1, 1000)

		//mvMatrix = mgl32.Translate3D(float32(mouseX), float32(mouseY), 0)
		mvMatrix = camera.Apply()

		gl.UniformMatrix4fv(pMatrixUniform, false, pMatrix[:])
		gl.UniformMatrix4fv(mvMatrixUniform, false, mvMatrix[:])

		// Render.
		{
			gl.BindBuffer(gl.ARRAY_BUFFER, vertexVbo)
			vertexPositionAttribute := gl.GetAttribLocation(program, "aVertexPosition")
			gl.EnableVertexAttribArray(vertexPositionAttribute)
			gl.VertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0)

			gl.DrawArrays(gl.TRIANGLES, 0, 3*m_TriangleCount)
		}

		window.SwapBuffers()
		goglfw.PollEvents()
	}
}

// ---

func mustAction(action goglfw.Action, err error) goglfw.Action {
	if err != nil {
		panic(err)
	}
	return action
}

func mustBool(b bool, err error) bool {
	if err != nil {
		panic(err)
	}
	return b
}

// =====

var camera = Camera{x: 3.413633, y: -3.883973, z: 3.516000, rh: 322.550000, rv: -33.400000}

type Camera struct {
	x float64
	y float64
	z float64

	rh float64
	rv float64
}

func (this *Camera) Apply() mgl32.Mat4 {
	mat := mgl32.Ident4()
	mat = mat.Mul4(mgl32.HomogRotate3D(mgl32.DegToRad(float32(this.rv+90)), mgl32.Vec3{-1, 0, 0})) // The 90 degree offset is necessary to make Z axis the up-vector in OpenGL (normally it's the in/out-of-screen vector).
	mat = mat.Mul4(mgl32.HomogRotate3D(mgl32.DegToRad(float32(this.rh)), mgl32.Vec3{0, 0, 1}))
	mat = mat.Mul4(mgl32.Translate3D(float32(-this.x), float32(-this.y), float32(-this.z)))
	return mat
}
