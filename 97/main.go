// Play with go-collada to load and render a simple 3D model (browser and desktop).
package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/GlenKelley/go-collada"
	"github.com/bradfitz/iter"
	"github.com/go-gl/mathgl/mgl32"
	"github.com/go-gl/mathgl/mgl64"
	"github.com/goxjs/gl"
	"github.com/goxjs/gl/glutil"
	"github.com/goxjs/glfw"
	"golang.org/x/mobile/exp/f32"
)

var startedProcess = time.Now()

const (
	vertexSource = `//#version 120 // OpenGL 2.1.
//#version 100 // WebGL.

attribute vec3 aVertexPosition;
attribute vec3 aNormal;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

varying vec3 vPosition;
varying vec3 vNormal;

void main() {
	vNormal = normalize(aNormal);
	vPosition = aVertexPosition.xyz;
	gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
}
`
	fragmentSource = `//#version 120 // OpenGL 2.1.
//#version 100 // WebGL.

#ifdef GL_ES
	precision lowp float;
#endif

uniform vec3 uCameraPosition;

varying vec3 vPosition;
varying vec3 vNormal;

void main() {
	vec3 vNormal = normalize(vNormal);

	// Diffuse lighting.
	vec3 toLight = normalize(vec3(1.0, 1.0, 3.0));
	float diffuse = dot(vNormal, toLight);
	diffuse = clamp(diffuse, 0.0, 1.0);

	// Specular highlights.
	vec3 posToCamera = normalize(uCameraPosition - vPosition);
	vec3 halfV = normalize(toLight + posToCamera);
	float intSpec = max(dot(halfV, vNormal), 0.0);
	vec3 spec = 0.5 * vec3(1.0, 1.0, 1.0) * pow(intSpec, 32.0);

	vec3 PixelColor = (0.2 + 0.8 * diffuse) * vec3(0.75, 0.75, 0.75) + spec;

	gl_FragColor = vec4(PixelColor, 1.0);
}
`
)

var program gl.Program
var pMatrixUniform gl.Uniform
var mvMatrixUniform gl.Uniform
var uCameraPosition gl.Uniform

var mvMatrix mgl32.Mat4
var pMatrix mgl32.Mat4

func initShaders() error {
	var err error
	program, err = glutil.CreateProgram(vertexSource, fragmentSource)
	if err != nil {
		return err
	}

	gl.ValidateProgram(program)
	if gl.GetProgrami(program, gl.VALIDATE_STATUS) != gl.TRUE {
		return errors.New("VALIDATE_STATUS: " + gl.GetProgramInfoLog(program))
	}

	gl.UseProgram(program)

	pMatrixUniform = gl.GetUniformLocation(program, "uPMatrix")
	mvMatrixUniform = gl.GetUniformLocation(program, "uMVMatrix")
	uCameraPosition = gl.GetUniformLocation(program, "uCameraPosition")

	if glError := gl.GetError(); glError != 0 {
		return fmt.Errorf("gl.GetError: %v", glError)
	}

	return nil
}

var doc *collada.Collada
var m_TriangleCount, m_LineCount int
var vertexVbo gl.Buffer
var normalVbo gl.Buffer

func loadModel() error {
	//doc, err = collada.LoadDocument("/Users/Dmitri/Dmitri/^Work/^GitHub/Slide/Models/unit_box.dae")
	//doc, err = collada.LoadDocument("/Users/Dmitri/Dmitri/^Work/^GitHub/Slide/Models/complex_shape.dae")
	//doc, err = collada.LoadDocument("/Users/Dmitri/Dmitri/^Work/^GitHub/Slide/Models/Wall_Scene/Platform.dae")
	//doc, err = collada.LoadDocument("/Users/Dmitri/Dmitri/^Work/^GitHub/Slide/Models/Ship.dae")
	//doc, err = collada.LoadDocument("/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/Hover/vehicle0.dae")

	file, err := glfw.Open("./vehicle0.dae")
	if err != nil {
		return err
	}
	defer file.Close()

	doc, err = collada.LoadDocumentFromReader(file)
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

	//goon.DumpExpr(doc.LibraryGeometries[0].Geometry)

	var scale float32 = 1.0
	if strings.Contains(doc.HasAsset.Asset.Contributor[0].AuthoringTool, "Google SketchUp 8") {
		scale = 0.4
	}

	vertices := make([]float32, 3*3*m_TriangleCount)
	normals := make([]float32, 3*3*m_TriangleCount)

	nTriangleNumber := 0
	for _, geometry := range doc.LibraryGeometries[0].Geometry {
		if len(geometry.Mesh.Triangles) == 0 {
			continue
		}

		// HACK. 0 seems to be position, 1 is normal, but need to not hardcode this.
		pVertexData := geometry.Mesh.Source[0].FloatArray.F32()
		pNormalData := geometry.Mesh.Source[1].FloatArray.F32()

		//goon.DumpExpr(len(pVertexData))
		//goon.DumpExpr(len(pNormalData))

		unsharedCount := len(geometry.Mesh.Vertices.Input)

		for _, triangles := range geometry.Mesh.Triangles {
			sharedIndicies := triangles.HasP.P.I()
			sharedCount := len(triangles.HasSharedInput.Input)

			//goon.DumpExpr(len(sharedIndicies))
			//goon.DumpExpr(sharedCount)

			for nTriangle := range iter.N(triangles.HasCount.Count) {
				offset := 0 // HACK. 0 seems to be position, 1 is normal, but need to not hardcode this.
				vertices[3*3*nTriangleNumber+0] = pVertexData[3*sharedIndicies[(3*nTriangle+0)*sharedCount+offset]+0] * scale
				vertices[3*3*nTriangleNumber+1] = pVertexData[3*sharedIndicies[(3*nTriangle+0)*sharedCount+offset]+1] * scale
				vertices[3*3*nTriangleNumber+2] = pVertexData[3*sharedIndicies[(3*nTriangle+0)*sharedCount+offset]+2] * scale
				vertices[3*3*nTriangleNumber+3] = pVertexData[3*sharedIndicies[(3*nTriangle+1)*sharedCount+offset]+0] * scale
				vertices[3*3*nTriangleNumber+4] = pVertexData[3*sharedIndicies[(3*nTriangle+1)*sharedCount+offset]+1] * scale
				vertices[3*3*nTriangleNumber+5] = pVertexData[3*sharedIndicies[(3*nTriangle+1)*sharedCount+offset]+2] * scale
				vertices[3*3*nTriangleNumber+6] = pVertexData[3*sharedIndicies[(3*nTriangle+2)*sharedCount+offset]+0] * scale
				vertices[3*3*nTriangleNumber+7] = pVertexData[3*sharedIndicies[(3*nTriangle+2)*sharedCount+offset]+1] * scale
				vertices[3*3*nTriangleNumber+8] = pVertexData[3*sharedIndicies[(3*nTriangle+2)*sharedCount+offset]+2] * scale

				if unsharedCount*sharedCount == 2 {
					offset = sharedCount - 1 // HACK. 0 seems to be position, 1 is normal, but need to not hardcode this.
					normals[3*3*nTriangleNumber+0] = pNormalData[3*sharedIndicies[(3*nTriangle+0)*sharedCount+offset]+0]
					normals[3*3*nTriangleNumber+1] = pNormalData[3*sharedIndicies[(3*nTriangle+0)*sharedCount+offset]+1]
					normals[3*3*nTriangleNumber+2] = pNormalData[3*sharedIndicies[(3*nTriangle+0)*sharedCount+offset]+2]
					normals[3*3*nTriangleNumber+3] = pNormalData[3*sharedIndicies[(3*nTriangle+1)*sharedCount+offset]+0]
					normals[3*3*nTriangleNumber+4] = pNormalData[3*sharedIndicies[(3*nTriangle+1)*sharedCount+offset]+1]
					normals[3*3*nTriangleNumber+5] = pNormalData[3*sharedIndicies[(3*nTriangle+1)*sharedCount+offset]+2]
					normals[3*3*nTriangleNumber+6] = pNormalData[3*sharedIndicies[(3*nTriangle+2)*sharedCount+offset]+0]
					normals[3*3*nTriangleNumber+7] = pNormalData[3*sharedIndicies[(3*nTriangle+2)*sharedCount+offset]+1]
					normals[3*3*nTriangleNumber+8] = pNormalData[3*sharedIndicies[(3*nTriangle+2)*sharedCount+offset]+2]
				}

				nTriangleNumber++
			}
		}
	}

	// ---

	vertexVbo = createVbo3Float(vertices)
	normalVbo = createVbo3Float(normals)

	if glError := gl.GetError(); glError != 0 {
		return fmt.Errorf("gl.GetError: %v", glError)
	}

	return nil
}

func createVbo3Float(vertices []float32) gl.Buffer {
	vbo := gl.CreateBuffer()
	gl.BindBuffer(gl.ARRAY_BUFFER, vbo)
	gl.BufferData(gl.ARRAY_BUFFER, f32.Bytes(binary.LittleEndian, vertices...), gl.STATIC_DRAW)
	return vbo
}

func createVbo3Ubyte(vertices []uint8) gl.Buffer {
	vbo := gl.CreateBuffer()
	gl.BindBuffer(gl.ARRAY_BUFFER, vbo)
	gl.BufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
	return vbo
}

var windowSize = [2]int{1024, 800}

func main() {
	err := glfw.Init(gl.ContextWatcher)
	if err != nil {
		panic(err)
	}
	defer glfw.Terminate()

	window, err := glfw.CreateWindow(windowSize[0], windowSize[1], "", nil, nil)
	if err != nil {
		panic(err)
	}
	window.MakeContextCurrent()

	gl.ClearColor(0.8, 0.3, 0.01, 1)
	gl.Clear(gl.COLOR_BUFFER_BIT)

	framebufferSizeCallback := func(w *glfw.Window, framebufferSize0, framebufferSize1 int) {
		gl.Viewport(0, 0, framebufferSize0, framebufferSize1)

		windowSize[0], windowSize[1] = w.GetSize()
	}
	{
		var framebufferSize [2]int
		framebufferSize[0], framebufferSize[1] = window.GetFramebufferSize()
		framebufferSizeCallback(window, framebufferSize[0], framebufferSize[1])
	}
	window.SetFramebufferSizeCallback(framebufferSizeCallback)

	mouseMovement := func(_ *glfw.Window, xpos, ypos, xdelta, ydelta float64) {
		sliders := []float64{xdelta, ydelta}

		{
			isButtonPressed := [2]bool{
				window.GetMouseButton(glfw.MouseButton1) != glfw.Release,
				window.GetMouseButton(glfw.MouseButton2) != glfw.Release,
			}

			var moveSpeed = 1.0
			const rotateSpeed = 0.3

			if window.GetKey(glfw.KeyLeftShift) != glfw.Release || window.GetKey(glfw.KeyRightShift) != glfw.Release {
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
		}
	}
	window.SetMouseMovementCallback(mouseMovement)

	window.SetMouseButtonCallback(func(_ *glfw.Window, button glfw.MouseButton, action glfw.Action, mods glfw.ModifierKey) {
		isButtonPressed := [2]bool{
			window.GetMouseButton(glfw.MouseButton1) != glfw.Release,
			window.GetMouseButton(glfw.MouseButton2) != glfw.Release,
		}

		if isButtonPressed[0] || isButtonPressed[1] {
			window.SetInputMode(glfw.CursorMode, glfw.CursorDisabled)
		} else {
			window.SetInputMode(glfw.CursorMode, glfw.CursorNormal)
		}
	})

	err = initShaders()
	if err != nil {
		panic(err)
	}
	err = loadModel()
	if err != nil {
		panic(err)
	}

	gl.Enable(gl.DEPTH_TEST)

	fmt.Printf("Loaded in %v ms.\n", time.Since(startedProcess).Seconds()*1000)

	firstFrame := true
	for !window.ShouldClose() {
		gl.Clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

		//pMatrix = mgl32.Ortho2D(0, float32(windowSize[0]), float32(windowSize[1]), 0)
		pMatrix = mgl32.Perspective(mgl32.DegToRad(45), float32(windowSize[0])/float32(windowSize[1]), 0.1, 1000)

		//mvMatrix = mgl32.Translate3D(float32(mouseX), float32(mouseY), 0)
		mvMatrix = camera.Apply()

		gl.UniformMatrix4fv(pMatrixUniform, pMatrix[:])
		gl.UniformMatrix4fv(mvMatrixUniform, mvMatrix[:])
		gl.Uniform3f(uCameraPosition, float32(camera.x), float32(camera.y), float32(camera.z))

		// Render.
		{
			gl.BindBuffer(gl.ARRAY_BUFFER, vertexVbo)
			vertexPositionAttribute := gl.GetAttribLocation(program, "aVertexPosition")
			gl.EnableVertexAttribArray(vertexPositionAttribute)
			gl.VertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0)

			gl.BindBuffer(gl.ARRAY_BUFFER, normalVbo)
			normalAttribute := gl.GetAttribLocation(program, "aNormal")
			gl.EnableVertexAttribArray(normalAttribute)
			gl.VertexAttribPointer(normalAttribute, 3, gl.FLOAT, false, 0, 0)

			gl.DrawArrays(gl.TRIANGLES, 0, 3*m_TriangleCount)
		}

		window.SwapBuffers()
		glfw.PollEvents()

		if firstFrame {
			fmt.Printf("First frame in %v ms.\n", time.Since(startedProcess).Seconds()*1000)
			firstFrame = false
		}
	}

	//goon.DumpExpr(camera)
}

// =====

var camera = Camera{x: 22.816348782468104, y: 13.10065063866078, z: 26.516, rh: 239.74999999999983, rv: -46.299999999999976}

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
