package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"time"

	"github.com/go-gl/mathgl/mgl32"
	"github.com/go-gl/mathgl/mgl64"
	"github.com/gopherjs/gopherjs/js"
	"github.com/shurcooL/gogl"
	glfw "github.com/shurcooL/goglfw"
)

const skipTrack = false

var gl *gogl.Context

const (
	vertexSource = `//#version 120 // OpenGL 2.1.
//#version 100 // WebGL.

attribute vec3 aVertexPosition;
attribute vec3 aVertexColor;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

varying vec3 aPixelColor;

void main() {
	aPixelColor = aVertexColor;
	gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
}
`
	fragmentSource = `//#version 120 // OpenGL 2.1.
//#version 100 // WebGL.

#ifdef GL_ES
	precision lowp float;
#endif

varying vec3 aPixelColor;

void main() {
	gl_FragColor = vec4(aPixelColor, 1.0);
}
`
)

var program *gogl.Program
var pMatrixUniform *gogl.UniformLocation
var mvMatrixUniform *gogl.UniformLocation

var mvMatrix mgl32.Mat4
var pMatrix mgl32.Mat4

func initShaders() error {
	vertexShader := gl.CreateShader(gl.VERTEX_SHADER)
	gl.ShaderSource(vertexShader, vertexSource)
	gl.CompileShader(vertexShader)
	defer gl.DeleteShader(vertexShader)

	if !gl.GetShaderParameterb(vertexShader, gl.COMPILE_STATUS) {
		return errors.New("COMPILE_STATUS: " + gl.GetShaderInfoLog(vertexShader))
	}

	fragmentShader := gl.CreateShader(gl.FRAGMENT_SHADER)
	gl.ShaderSource(fragmentShader, fragmentSource)
	gl.CompileShader(fragmentShader)
	defer gl.DeleteShader(fragmentShader)

	if !gl.GetShaderParameterb(fragmentShader, gl.COMPILE_STATUS) {
		return errors.New("COMPILE_STATUS: " + gl.GetShaderInfoLog(fragmentShader))
	}

	program = gl.CreateProgram()
	gl.AttachShader(program, vertexShader)
	gl.AttachShader(program, fragmentShader)

	gl.LinkProgram(program)
	if !gl.GetProgramParameterb(program, gl.LINK_STATUS) {
		return errors.New("LINK_STATUS: " + gl.GetProgramInfoLog(program))
	}

	gl.ValidateProgram(program)
	if !gl.GetProgramParameterb(program, gl.VALIDATE_STATUS) {
		return errors.New("VALIDATE_STATUS: " + gl.GetProgramInfoLog(program))
	}

	gl.UseProgram(program)

	pMatrixUniform = gl.GetUniformLocation(program, "uPMatrix")
	mvMatrixUniform = gl.GetUniformLocation(program, "uMVMatrix")

	if glError := gl.GetError(); glError != 0 {
		return fmt.Errorf("gl.GetError: %v", glError)
	}

	return nil
}

var triangleVertexPositionBuffer *gogl.Buffer

func createVbo() error {
	triangleVertexPositionBuffer = gl.CreateBuffer()
	gl.BindBuffer(gl.ARRAY_BUFFER, triangleVertexPositionBuffer)
	vertices := []float32{
		0, 0, 0,
		float32(track.Width), 0, 0,
		float32(track.Width), float32(track.Depth), 0,
		0, float32(track.Depth), 0,
	}
	gl.BufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)

	if glError := gl.GetError(); glError != 0 {
		return fmt.Errorf("gl.GetError: %v", glError)
	}

	return nil
}

func createVbo3Float(vertices []float32) *gogl.Buffer {
	vbo := gl.CreateBuffer()
	gl.BindBuffer(gl.ARRAY_BUFFER, vbo)
	gl.BufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
	return vbo
}

func createVbo3Ubyte(vertices []uint8) *gogl.Buffer {
	vbo := gl.CreateBuffer()
	gl.BindBuffer(gl.ARRAY_BUFFER, vbo)
	gl.BufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
	return vbo
}

var windowSize = [2]int{1024, 800}

func main() {
	err := glfw.Init()
	if err != nil {
		panic(err)
	}
	defer glfw.Terminate()

	window, err := glfw.CreateWindow(windowSize[0], windowSize[1], "Terrain", nil, nil)
	if err != nil {
		panic(err)
	}
	window.MakeContextCurrent()

	gl = window.Context

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

	track = newTrack("./track1.dat")

	err = initShaders()
	if err != nil {
		panic(err)
	}
	err = createVbo()
	if err != nil {
		panic(err)
	}

	gl.Enable(gl.DEPTH_TEST)

	for !window.ShouldClose() {
		gl.Clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

		//pMatrix = mgl32.Ortho2D(0, float32(windowSize[0]), float32(windowSize[1]), 0)
		pMatrix = mgl32.Perspective(mgl32.DegToRad(45), float32(windowSize[0])/float32(windowSize[1]), 0.1, 1000)

		//mvMatrix = mgl32.Translate3D(float32(mouseX), float32(mouseY), 0)
		mvMatrix = camera.Apply()

		gl.UniformMatrix4fv(pMatrixUniform, false, pMatrix[:])
		gl.UniformMatrix4fv(mvMatrixUniform, false, mvMatrix[:])

		// Ground plane.
		gl.BindBuffer(gl.ARRAY_BUFFER, triangleVertexPositionBuffer)
		vertexPositionAttribute := gl.GetAttribLocation(program, "aVertexPosition")
		gl.EnableVertexAttribArray(vertexPositionAttribute)
		gl.VertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0)
		gl.DrawArrays(gl.TRIANGLE_FAN, 0, 4)

		if !skipTrack {
			track.Render()
		}

		window.SwapBuffers()
		glfw.PollEvents()
	}
}

// =====

var track *Track

const TRIGROUP_NUM_BITS_USED = 510
const TRIGROUP_NUM_DWORDS = (TRIGROUP_NUM_BITS_USED + 2) / 32
const TRIGROUP_WIDTHSHIFT = 4
const TERR_HEIGHT_SCALE = 1.0 / 32

type TerrTypeNode struct {
	Type       uint8
	NextStartX uint16
	Next       uint16
	_          uint8
}

type NavCoord struct {
	X, Z             uint16
	DistToStartCoord uint16 // Decider at forks, and determines racers' rank/place.
	Next             uint16
	Alt              uint16
}

type NavCoordLookupNode struct {
	NavCoord   uint16
	NextStartX uint16
	Next       uint16
}

type TerrCoord struct {
	Height         uint16
	LightIntensity uint8
}

type TriGroup struct {
	Data [TRIGROUP_NUM_DWORDS]uint32
}

type TrackFileHeader struct {
	SunlightDirection, SunlightPitch float32
	RacerStartPositions              [8][3]float32
	NumTerrTypes                     uint16
	NumTerrTypeNodes                 uint16
	NumNavCoords                     uint16
	NumNavCoordLookupNodes           uint16
	Width, Depth                     uint16
}

type Track struct {
	TrackFileHeader
	NumTerrCoords  uint32
	TriGroupsWidth uint32
	TriGroupsDepth uint32
	NumTriGroups   uint32

	TerrTypeTextureFilenames []string

	TerrTypeRuns  []TerrTypeNode
	TerrTypeNodes []TerrTypeNode

	NavCoords           []NavCoord
	NavCoordLookupRuns  []NavCoordLookupNode
	NavCoordLookupNodes []NavCoordLookupNode

	TerrCoords []TerrCoord
	TriGroups  []TriGroup

	vertexVbo *gogl.Buffer
	colorVbo  *gogl.Buffer
}

func newTrack(path string) *Track {
	// HACK: Skip slow loading for now.
	if skipTrack {
		return &Track{TrackFileHeader: TrackFileHeader{Width: 721, Depth: 721}}
	}

	started := time.Now()

	file, err := glfw.Open(path)
	if err != nil {
		panic(err)
	}
	defer file.Close()

	var track Track

	binary.Read(file, binary.LittleEndian, &track.TrackFileHeader)

	// Stuff derived from header info.
	track.NumTerrCoords = uint32(track.Width) * uint32(track.Depth)
	track.TriGroupsWidth = (uint32(track.Width) - 1) >> TRIGROUP_WIDTHSHIFT
	track.TriGroupsDepth = (uint32(track.Depth) - 1) >> TRIGROUP_WIDTHSHIFT
	track.NumTriGroups = track.TriGroupsWidth * track.TriGroupsDepth

	track.TerrTypeTextureFilenames = make([]string, track.NumTerrTypes)
	for i := uint16(0); i < track.NumTerrTypes; i++ {
		var terrTypeTextureFilename [32]byte
		binary.Read(file, binary.LittleEndian, &terrTypeTextureFilename)
		track.TerrTypeTextureFilenames[i] = cStringToGoString(terrTypeTextureFilename[:])
	}

	track.TerrTypeRuns = make([]TerrTypeNode, track.Depth)
	binary.Read(file, binary.LittleEndian, &track.TerrTypeRuns)

	track.TerrTypeNodes = make([]TerrTypeNode, track.NumTerrTypeNodes)
	binary.Read(file, binary.LittleEndian, &track.TerrTypeNodes)

	track.NavCoords = make([]NavCoord, track.NumNavCoords)
	binary.Read(file, binary.LittleEndian, &track.NavCoords)

	track.NavCoordLookupRuns = make([]NavCoordLookupNode, track.Depth)
	binary.Read(file, binary.LittleEndian, &track.NavCoordLookupRuns)

	track.NavCoordLookupNodes = make([]NavCoordLookupNode, track.NumNavCoordLookupNodes)
	binary.Read(file, binary.LittleEndian, &track.NavCoordLookupNodes)

	track.TerrCoords = make([]TerrCoord, track.NumTerrCoords)
	binary.Read(file, binary.LittleEndian, &track.TerrCoords)

	track.TriGroups = make([]TriGroup, track.NumTriGroups)
	binary.Read(file, binary.LittleEndian, &track.TriGroups)

	fileOffset, err := file.Seek(0, io.SeekCurrent)
	if err != nil {
		panic(err)
	}
	fileSize, err := file.Seek(0, io.SeekEnd)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Read %v of %v bytes.\n", fileOffset, fileSize)

	{
		rowCount := int(track.Depth) - 1
		rowLength := int(track.Width)

		vertexData := make([]float32, 3*2*rowLength*rowCount)
		colorData := make([]uint8, 3*2*rowLength*rowCount)

		var index int
		for y := 1; y < int(track.Depth); y++ {
			for x := 0; x < int(track.Width); x++ {
				for i := 0; i < 2; i++ {
					yy := y - i

					terrCoord := &track.TerrCoords[yy*int(track.Width)+x]
					height := float64(terrCoord.Height) * TERR_HEIGHT_SCALE
					lightIntensity := uint8(terrCoord.LightIntensity)

					vertexData[3*index+0], vertexData[3*index+1], vertexData[3*index+2] = float32(x), float32(yy), float32(height)
					colorData[3*index+0], colorData[3*index+1], colorData[3*index+2] = lightIntensity, lightIntensity, lightIntensity
					index++
				}
			}
		}

		track.vertexVbo = createVbo3Float(vertexData)
		track.colorVbo = createVbo3Ubyte(colorData)
	}

	fmt.Println("Done loading track in:", time.Since(started))
	if js.Global != nil {
		js.Global.Call("alert", fmt.Sprintln("Done loading track in:", time.Since(started)))
	}

	return &track
}

func (track *Track) Render() {
	rowCount := uint64(track.Depth) - 1
	rowLength := uint64(track.Width)

	gl.BindBuffer(gl.ARRAY_BUFFER, track.vertexVbo)
	vertexPositionAttribute := gl.GetAttribLocation(program, "aVertexPosition")
	gl.EnableVertexAttribArray(vertexPositionAttribute)
	gl.VertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0)

	gl.BindBuffer(gl.ARRAY_BUFFER, track.colorVbo)
	vertexColorAttribute := gl.GetAttribLocation(program, "aVertexColor")
	gl.EnableVertexAttribArray(vertexColorAttribute)
	gl.VertexAttribPointer(vertexColorAttribute, 3, gl.UNSIGNED_BYTE, true, 0, 0)

	for row := uint64(0); row < rowCount; row++ {
		gl.DrawArrays(gl.TRIANGLE_STRIP, int(row*2*rowLength), int(2*rowLength))
	}
}

// ---

func cStringToGoString(cString []byte) string {
	n := 0
	for i, b := range cString {
		if b == 0 {
			break
		}
		n = i + 1
	}
	return string(cString[:n])
}

// =====

var camera = Camera{x: 160.12941888695732, y: 685.2641404161014, z: 600, rh: 115.50000000000003, rv: -14.999999999999998}

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
