// +build js

package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	_ "image/png"
	"math"
	"os"
	"time"

	"github.com/ajhager/webgl"
	"github.com/go-gl/mathgl/mgl32"
	"github.com/go-gl/mathgl/mgl64"
	"github.com/gopherjs/gopherjs/js"
	"github.com/shurcooL/goglfw"
)

const skipTrack = false

var gl *webgl.Context

const (
	vertexSource = `#version 100

const float TERR_TEXTURE_SCALE = 1.0 / 20.0; // From track.h rather than terrain.h.

attribute vec3 aVertexPosition;
attribute vec3 aVertexColor;
attribute float aVertexTerrType;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

varying vec3 vPixelColor;
varying vec2 vTexCoord;
varying float vTerrType;

void main() {
	vPixelColor = aVertexColor;
	vTexCoord = aVertexPosition.xy * TERR_TEXTURE_SCALE;
	vTerrType = aVertexTerrType;
	gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
}
`
	fragmentSource = `#version 100

precision lowp float;

uniform sampler2D texUnit;
uniform sampler2D texUnit2;

varying vec3 vPixelColor;
varying vec2 vTexCoord;
varying float vTerrType;

void main() {
	vec3 tex = mix(texture2D(texUnit, vTexCoord).rgb, texture2D(texUnit2, vTexCoord).rgb, vTerrType);
	gl_FragColor = vec4(vPixelColor * tex, 1.0);
}
`
)

var program *webgl.Program
var pMatrixUniform *webgl.UniformLocation
var mvMatrixUniform *webgl.UniformLocation
var texUnit *webgl.UniformLocation
var texUnit2 *webgl.UniformLocation

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
	texUnit = gl.GetUniformLocation(program, "texUnit")
	texUnit2 = gl.GetUniformLocation(program, "texUnit2")

	if glError := gl.GetError(); glError != 0 {
		return fmt.Errorf("gl.GetError: %v", glError)
	}

	return nil
}

var triangleVertexPositionBuffer *webgl.Buffer

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

	attrs := webgl.DefaultAttributes()
	attrs.Alpha = false
	attrs.Antialias = false

	canvas := window.Canvas // TODO: See what's the best way.
	gl, err = webgl.NewContext(canvas.Underlying(), attrs)
	if err != nil {
		js.Global.Call("alert", "Error: "+err.Error())
	}

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
			var rotateSpeed = 0.3

			if mustAction(window.GetKey(goglfw.KeyLeftShift)) != goglfw.Release || mustAction(window.GetKey(goglfw.KeyRightShift)) != goglfw.Release {
				moveSpeed *= 0.01
				rotateSpeed *= 0.1
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

	track = newTrack("./track1.dat")

	err = initShaders()
	if err != nil {
		panic(err)
	}
	err = createVbo()
	if err != nil {
		panic(err)
	}
	var textures [2]*webgl.Texture
	textures[0], err = loadTexture("./dirt.png")
	if err != nil {
		panic(err)
	}
	textures[1], err = loadTexture("./sand.png")
	if err != nil {
		panic(err)
	}

	gl.ClearColor(0.8, 0.3, 0.01, 1)
	gl.Enable(gl.DEPTH_TEST)

	for !mustBool(window.ShouldClose()) {
		gl.Clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

		//pMatrix = mgl32.Ortho2D(0, float32(windowSize[0]), float32(windowSize[1]), 0)
		pMatrix = mgl32.Perspective(45, float32(windowSize[0])/float32(windowSize[1]), 0.1, 1000)

		//mvMatrix = mgl32.Translate3D(float32(mouseX), float32(mouseY), 0)
		mvMatrix = camera.Apply()

		gl.UniformMatrix4fv(pMatrixUniform, false, pMatrix[:])
		gl.UniformMatrix4fv(mvMatrixUniform, false, mvMatrix[:])

		gl.Uniform1i(texUnit, 0)
		gl.ActiveTexture(gl.TEXTURE0)
		gl.BindTexture(gl.TEXTURE_2D, textures[0])
		gl.Uniform1i(texUnit2, 1)
		gl.ActiveTexture(gl.TEXTURE1)
		gl.BindTexture(gl.TEXTURE_2D, textures[1])

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

var track *Track

const TRIGROUP_NUM_BITS_USED = 510
const TRIGROUP_NUM_DWORDS = (TRIGROUP_NUM_BITS_USED + 2) / 32
const TRIGROUP_WIDTHSHIFT = 4
const TERR_HEIGHT_SCALE = 1.0 / 32
const TERR_TEXTURE_SCALE = 1.0 / 20 // From track.h rather than terrain.h.

type TerrTypeNode struct {
	Type       uint8
	_          uint8
	NextStartX uint16
	Next       uint16
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

	vertexVbo       *webgl.Buffer
	colorVbo        *webgl.Buffer
	terrTypeVbo     *webgl.Buffer
	textureCoordVbo uint32
}

func newTrack(path string) *Track {
	// HACK: Skip slow loading for now.
	if skipTrack {
		return &Track{TrackFileHeader: TrackFileHeader{Width: 721, Depth: 721}}
	}

	started := time.Now()

	file, err := goglfw.Open(path)
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

	fileOffset, err := file.Seek(0, os.SEEK_CUR)
	if err != nil {
		panic(err)
	}
	fileSize, err := file.Seek(0, os.SEEK_END)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Read %v of %v bytes.\n", fileOffset, fileSize)

	{
		rowCount := int(track.Depth) - 1
		rowLength := int(track.Width)

		terrTypeMap := make([]uint8, int(track.Width)*int(track.Depth))
		for y := 0; y < int(track.Depth); y++ {
			pCurrNode := &track.TerrTypeRuns[y]

			for x := 0; x < int(track.Width); x++ {
				if x >= int(pCurrNode.NextStartX) {
					pCurrNode = &track.TerrTypeNodes[pCurrNode.Next]
				}
				terrTypeMap[y*int(track.Width)+x] = pCurrNode.Type
			}
		}

		vertexData := make([]float32, 3*2*rowLength*rowCount)
		colorData := make([]uint8, 3*2*rowLength*rowCount)
		terrTypeData := make([]float32, 2*rowLength*rowCount)
		textureCoordData := make([][2]float32, 2*rowLength*rowCount)

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
					if terrTypeMap[yy*int(track.Width)+x] == 0 {
						terrTypeData[index] = 0
					} else {
						terrTypeData[index] = 1
					}
					textureCoordData[index] = [2]float32{float32(float32(x) * TERR_TEXTURE_SCALE), float32(float32(yy) * TERR_TEXTURE_SCALE)}
					index++
				}
			}
		}

		track.vertexVbo = createVbo3Float(vertexData)
		track.colorVbo = createVbo3Ubyte(colorData)
		track.terrTypeVbo = createVbo3Float(terrTypeData)
		//track.textureCoordVbo = createVbo2Float(textureCoordData)
	}

	fmt.Println("Done loading track in:", time.Since(started))

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

	gl.BindBuffer(gl.ARRAY_BUFFER, track.terrTypeVbo)
	vertexTerrTypeAttribute := gl.GetAttribLocation(program, "aVertexTerrType")
	gl.EnableVertexAttribArray(vertexTerrTypeAttribute)
	gl.VertexAttribPointer(vertexTerrTypeAttribute, 1, gl.FLOAT, false, 0, 0)

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

//var camera = Camera{x: 651.067403141426, y: 604.5361059479138, z: 527.1199999999999, rh: 175.50000000000017, rv: -33.600000000000044}

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

// =====

func loadTexture(path string) (*webgl.Texture, error) {
	fmt.Printf("Trying to load texture %q: ", path)

	// Open the file
	/*file, err := goglfw.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	// Decode the image
	img, _, err := image.Decode(file)
	if err != nil {
		return nil, err
	}

	bounds := img.Bounds()
	fmt.Printf("loaded %vx%v texture.\n", bounds.Dx(), bounds.Dy())*/

	ch := make(chan error, 1)
	img := js.Global.Get("Image").New()
	img.Call("addEventListener", "load", func(js.Object) {
		go func() { ch <- nil }()
	}, false)
	img.Call("addEventListener", "error", func(o js.Object) {
		go func() { ch <- &js.Error{Object: o} }()
	}, false)
	img.Set("src", path)
	err := <-ch
	if err != nil {
		return nil, err
	}

	texture := gl.CreateTexture()
	gl.BindTexture(gl.TEXTURE_2D, texture)
	//gl.TexParameteri(gl.TEXTURE_2D, gl.GENERATE_MIPMAP, gl.TRUE)
	gl.TexParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
	gl.TexParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	gl.TexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
	gl.GenerateMipmap(gl.TEXTURE_2D)

	if glError := gl.GetError(); glError != 0 {
		return nil, fmt.Errorf("gl.GetError: %v", glError)
	}

	return texture, nil
}
