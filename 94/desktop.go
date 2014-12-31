// +build !js

package main

import (
	"errors"
	"fmt"

	"github.com/ajhager/webgl"
	"github.com/go-gl/mathgl/mgl32"
	"github.com/shurcooL/goglfw"
)

var gl *webgl.Context

const (
	vertexSource = `#version 120

attribute vec3 aVertexPosition;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

void main() {
	gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
}
`
	fragmentSource = `#version 120

void main() {
	gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
}
`
)

var program *webgl.Program
var pMatrixUniform *webgl.UniformLocation
var mvMatrixUniform *webgl.UniformLocation

var mvMatrix mgl32.Mat4
var pMatrix mgl32.Mat4

var itemSize int
var numItems int

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

func createVbo() error {
	triangleVertexPositionBuffer := gl.CreateBuffer()
	gl.BindBuffer(gl.ARRAY_BUFFER, triangleVertexPositionBuffer)
	vertices := []float32{
		0, 0, 0,
		300, 100, 0,
		0, 100, 0,
	}
	gl.BufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
	itemSize = 3
	numItems = 3

	vertexPositionAttribute := gl.GetAttribLocation(program, "aVertexPosition")
	gl.EnableVertexAttribArray(vertexPositionAttribute)
	gl.VertexAttribPointer(vertexPositionAttribute, itemSize, gl.FLOAT, false, 0, 0)

	if glError := gl.GetError(); glError != 0 {
		return fmt.Errorf("gl.GetError: %v", glError)
	}

	return nil
}

var windowSize = [2]int{400, 400}

var mouseX, mouseY float64 = 50, 100

func main() {
	err := goglfw.Init()
	if err != nil {
		panic(err)
	}
	defer goglfw.Terminate()

	window, err := goglfw.CreateWindow(windowSize[0], windowSize[1], "Testing", nil, nil)
	if err != nil {
		panic(err)
	}
	window.MakeContextCurrent()

	gl = window.Context

	MousePos := func(_ *goglfw.Window, x, y float64) {
		mouseX, mouseY = x, y
	}
	window.SetCursorPositionCallback(MousePos)

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

	err = initShaders()
	if err != nil {
		panic(err)
	}
	err = createVbo()
	if err != nil {
		panic(err)
	}

	gl.ClearColor(0.8, 0.3, 0.01, 1)

	for !mustBool(window.ShouldClose()) {
		gl.Clear(gl.COLOR_BUFFER_BIT)

		pMatrix = mgl32.Ortho2D(0, float32(windowSize[0]), float32(windowSize[1]), 0)

		mvMatrix = mgl32.Translate3D(float32(mouseX), float32(mouseY), 0)

		gl.UniformMatrix4fv(pMatrixUniform, false, pMatrix[:])
		gl.UniformMatrix4fv(mvMatrixUniform, false, mvMatrix[:])
		gl.DrawArrays(gl.TRIANGLES, 0, numItems)

		window.SwapBuffers()
		goglfw.PollEvents()
	}
}

// ---

func mustBool(b bool, err error) bool {
	if err != nil {
		panic(err)
	}
	return b
}
