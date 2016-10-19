// Render a 3D textured terrain with flying camera controls.
package main

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"image"
	_ "image/png"
	"io"
	"io/ioutil"
	"math"
	"time"

	"github.com/go-gl/mathgl/mgl32"
	"github.com/go-gl/mathgl/mgl64"
	"github.com/goxjs/gl"
	"github.com/goxjs/gl/glutil"
	"github.com/goxjs/glfw"
	"golang.org/x/mobile/exp/f32"
)

var wireframe bool

var program gl.Program
var pMatrixUniform gl.Uniform
var mvMatrixUniform gl.Uniform
var wireframeUniform gl.Uniform
var texUnit gl.Uniform
var texUnit2 gl.Uniform

var mvMatrix mgl32.Mat4
var pMatrix mgl32.Mat4

func initShaders() error {
	const (
		vertexSource = `//#version 120 // OpenGL 2.1.
//#version 100 // WebGL.

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
		fragmentSource = `//#version 120 // OpenGL 2.1.
//#version 100 // WebGL.

#ifdef GL_ES
	precision lowp float;
#endif

const float TERR_TEXTURE_SCALE = 1.0 / 20.0; // From track.h rather than terrain.h.

uniform bool wireframe;

uniform sampler2D texUnit;
uniform sampler2D texUnit2;

varying vec3 vPixelColor;
varying vec2 vTexCoord;
varying float vTerrType;

void main() {
	if (wireframe) {
		vec2 unit;
		unit.x = mod(vTexCoord.x, TERR_TEXTURE_SCALE) / TERR_TEXTURE_SCALE;
		unit.y = mod(vTexCoord.y, TERR_TEXTURE_SCALE) / TERR_TEXTURE_SCALE;
		if (unit.x <= 0.02 || unit.x >= 0.98 || unit.y <= 0.02 || unit.y >= 0.98 ||
			(-0.02 <= unit.x - unit.y && unit.x - unit.y <= 0.02)) {

			gl_FragColor = vec4(unit.x, unit.y, 0.0, 1.0);
			return;
		};
	}

	vec3 tex = mix(texture2D(texUnit, vTexCoord).rgb, texture2D(texUnit2, vTexCoord).rgb, vTerrType);
	gl_FragColor = vec4(vPixelColor * tex, 1.0);
}
`
	)

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
	wireframeUniform = gl.GetUniformLocation(program, "wireframe")
	texUnit = gl.GetUniformLocation(program, "texUnit")
	texUnit2 = gl.GetUniformLocation(program, "texUnit2")

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

	window, err := glfw.CreateWindow(windowSize[0], windowSize[1], "Terrain", nil, nil)
	if err != nil {
		panic(err)
	}
	window.MakeContextCurrent()

	fmt.Printf("OpenGL: %s %s %s; %v samples.\n", gl.GetString(gl.VENDOR), gl.GetString(gl.RENDERER), gl.GetString(gl.VERSION), gl.GetInteger(gl.SAMPLES))
	fmt.Printf("GLSL: %s.\n", gl.GetString(gl.SHADING_LANGUAGE_VERSION))

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

	track, err = loadTrack("track1.dat")
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

		gl.UniformMatrix4fv(pMatrixUniform, pMatrix[:])
		gl.UniformMatrix4fv(mvMatrixUniform, mvMatrix[:])

		track.Render()

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

	vertexVbo   gl.Buffer
	colorVbo    gl.Buffer
	terrTypeVbo gl.Buffer

	textures [2]gl.Texture
}

func loadTrack(path string) (*Track, error) {
	var track Track

	err := initShaders()
	if err != nil {
		panic(err)
	}
	track.textures[0], err = loadTexture("dirt.png")
	if err != nil {
		panic(err)
	}
	track.textures[1], err = loadTexture("sand.png")
	if err != nil {
		panic(err)
	}

	started := time.Now()

	file, err := glfw.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

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

	// Check that we've consumed the entire track file.
	if n, err := io.Copy(ioutil.Discard, file); err != nil {
		return nil, err
	} else if n > 0 {
		return nil, fmt.Errorf("loadTrack: did not get to end of track file, %d bytes left", n)
	}

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

		var index int
		for y := 1; y < int(track.Depth); y++ {
			for x := 0; x < int(track.Width); x++ {
				for i := 0; i < 2; i++ {
					yy := y - i

					terrCoord := &track.TerrCoords[yy*int(track.Width)+x]
					height := float64(terrCoord.Height) * TERR_HEIGHT_SCALE
					lightIntensity := terrCoord.LightIntensity

					vertexData[3*index+0], vertexData[3*index+1], vertexData[3*index+2] = float32(x), float32(yy), float32(height)
					colorData[3*index+0], colorData[3*index+1], colorData[3*index+2] = lightIntensity, lightIntensity, lightIntensity
					if terrTypeMap[yy*int(track.Width)+x] == 0 {
						terrTypeData[index] = 0
					} else {
						terrTypeData[index] = 1
					}
					index++
				}
			}
		}

		track.vertexVbo = createVbo3Float(vertexData)
		track.colorVbo = createVbo3Ubyte(colorData)
		track.terrTypeVbo = createVbo3Float(terrTypeData)
	}

	fmt.Println("Done loading track in:", time.Since(started))

	return &track, nil
}

func (track *Track) Render() {
	gl.UseProgram(program)
	{
		gl.UniformMatrix4fv(pMatrixUniform, pMatrix[:])
		gl.UniformMatrix4fv(mvMatrixUniform, mvMatrix[:])

		if wireframe {
			gl.Uniform1i(wireframeUniform, gl.TRUE)
		} else {
			gl.Uniform1i(wireframeUniform, gl.FALSE)
		}

		gl.Uniform1i(texUnit, 0)
		gl.ActiveTexture(gl.TEXTURE0)
		gl.BindTexture(gl.TEXTURE_2D, track.textures[0])
		gl.Uniform1i(texUnit2, 1)
		gl.ActiveTexture(gl.TEXTURE1)
		gl.BindTexture(gl.TEXTURE_2D, track.textures[1])

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

		rowCount := int(track.Depth) - 1
		rowLength := int(track.Width)

		for row := 0; row < rowCount; row++ {
			gl.DrawArrays(gl.TRIANGLE_STRIP, row*2*rowLength, 2*rowLength)
		}
	}
	gl.UseProgram(gl.Program{})
}

// ---

func cStringToGoString(cString []byte) string {
	i := bytes.IndexByte(cString, 0)
	if i < 0 {
		return ""
	}
	return string(cString[:i])
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

func loadTexture(path string) (gl.Texture, error) {
	fmt.Printf("Trying to load texture %q: ", path)
	started := time.Now()
	defer func() {
		fmt.Println("taken:", time.Since(started))
	}()

	// Open the file
	file, err := glfw.Open(path)
	if err != nil {
		return gl.Texture{}, err
	}
	defer file.Close()

	// Decode the image
	img, _, err := image.Decode(file)
	if err != nil {
		return gl.Texture{}, err
	}

	bounds := img.Bounds()
	fmt.Printf("loaded %vx%v texture.\n", bounds.Dx(), bounds.Dy())

	var pix []byte
	switch img := img.(type) {
	case *image.RGBA:
		pix = img.Pix
	case *image.NRGBA:
		pix = img.Pix
	default:
		panic("Unsupported image type.")
	}

	texture := gl.CreateTexture()
	gl.BindTexture(gl.TEXTURE_2D, texture)
	gl.TexParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
	gl.TexParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	gl.TexImage2D(gl.TEXTURE_2D, 0, bounds.Dx(), bounds.Dy(), gl.RGBA, gl.UNSIGNED_BYTE, pix)
	gl.GenerateMipmap(gl.TEXTURE_2D)

	if glError := gl.GetError(); glError != 0 {
		return gl.Texture{}, fmt.Errorf("gl.GetError: %v", glError)
	}

	return texture, nil
}
