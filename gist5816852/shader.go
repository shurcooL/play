package main

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os"
	"path/filepath"

	//gl "github.com/chsc/gogl/gl33"
	"github.com/go-gl/gl/v4.1-core/gl"
)

// Reads a file and returns its contents as a single string.
func ReadSourceFile(filename string) (string, error) {
	fp, err := os.Open(filename)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: ReadSourceFile: Could not open %s!\n", filename)
		fmt.Fprintf(os.Stderr, "os.Open: %v\n", err)
		return "", err
	}
	defer fp.Close()

	r := bufio.NewReaderSize(fp, 4*1024)
	var buffer bytes.Buffer
	for {
		line, err := r.ReadString('\n')
		buffer.WriteString(line)
		if err == io.EOF {
			// We've read the last string. Make sure there's a null byte.
			buffer.WriteByte('\000')
			break
		}
	}
	return buffer.String(), nil
}

// Create and Compile a shader, and return its shader Id.  shaderType
// should be one of gl.VERTEX_SHADER, gl.FRAGMENT_SHADER or gl.GEOMETRY_SHADER
func CreateShader(shaderType uint32, filePath string) uint32 {

	// Start by creating the shader object
	if (shaderType != gl.VERTEX_SHADER) && (shaderType != gl.FRAGMENT_SHADER) && (shaderType != gl.GEOMETRY_SHADER) {
		fmt.Fprintf(os.Stderr, "ERROR: not a supported shader type passed to CreateShader\n")
		return 0
	}
	shaderId := gl.CreateShader(shaderType)

	// Load the GLSL source code from the shader file
	shaderCode, err := ReadSourceFile(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: Could not read file %s\n", filePath)
		return 0
	}

	// Compile the shader
	var result int32 = gl.TRUE
	//var infoLogLength int32
	fmt.Fprintf(os.Stdout, "Compiling shader: %s\n", filePath)
	/*glslCode := gl.GLStringArray(shaderCode)
	defer gl.GLStringArrayFree(glslCode)
	gl.ShaderSource(shaderId, int32(len(glslCode)), &glslCode[0], nil)*/
	csources, free := gl.Strs(shaderCode)
	gl.ShaderSource(shaderId, 1, csources, nil)
	free()
	gl.CompileShader(shaderId)

	// Check the status of the compile - did it work?
	gl.GetShaderiv(shaderId, gl.COMPILE_STATUS, &result)
	/*gl.GetShaderiv(shaderId, gl.INFO_LOG_LENGTH, &infoLogLength)
	if infoLogLength > 0 {
		errorMsg := gl.GLStringAlloc(int32(infoLogLength))
		defer gl.GLStringFree(errorMsg)
		gl.GetShaderInfoLog(shaderId, int32(infoLogLength), nil, errorMsg)
		fmt.Fprintf(os.Stdout, "Shader info for %s: %s", filePath, gl.GoStr(errorMsg))
	}*/
	if result != gl.TRUE {
		fmt.Fprintf(os.Stderr, "ERROR: Shader compile for %s failed!\n", filePath)
		return 0
	}

	return shaderId
}

// CreateShaderProgram - create a shader program and attach the various shader objects
// defined by the files in the slice, then return the programID.  If the program
// cannot be created, 0 is returned instead.  Note that we don't exit if we cannot
// attach a specific shader - we try and soldier on.
//
// shaderFiles should contain a list of relative or absolute filenames of GLSL
// shaders to compile - we determine what kind of shader each is by its extension
// for this reason, filenames passed to CreateShaderProgram should have one of the
// following extensions based on the type of shader it is:
//
// Vertex Shaders: .vert, .vertexshader, .vertex, .vs
// Fragment Shaders: .frag, .fragmentshader, .fragment, .fs
// Geometry Shaders: .geom, .geometryshader, .geometry, .gs
func CreateShaderProgram(shaderFiles []string) uint32 {

	// Create the Program object
	var ProgramID uint32 = gl.CreateProgram()
	if ProgramID == 0 {
		fmt.Fprintf(os.Stderr, "ERROR: Cannot create shader program!")
		return 0
	}

	// For each attached shader, figure out its extension, and load a shader of
	// that type.
	var sid uint32 = 0
	for _, shader := range shaderFiles {
		sid = 0
		switch extension := filepath.Ext(shader); extension {
		case ".vertexshader", ".vert", ".vertex", ".vs":
			sid = CreateShader(gl.VERTEX_SHADER, shader)

		case ".fragmentshader", ".frag", ".fragment", ".fs":
			sid = CreateShader(gl.FRAGMENT_SHADER, shader)

		case ".geometryshader", ".geom", ".geometry", ".gs":
			sid = CreateShader(gl.GEOMETRY_SHADER, shader)

		default:
			fmt.Fprintf(os.Stderr, "ERROR: Don't understand extension %s\n", extension)
			fmt.Fprintf(os.Stderr, "Accepted extensions: .fragmentshader/.frag/.fragment/.fs for fragment shaders\n")
			fmt.Fprintf(os.Stderr, ".vertexshader/.vert/.vertex/.vs for vertex shaders, and\n")
			fmt.Fprintf(os.Stderr, ".geometryshader/.geom/.geometry/.gs for geometry shaders.\n")
		}
		if sid != 0 {
			gl.AttachShader(ProgramID, sid)
			defer gl.DeleteShader(sid)
		} else {
			fmt.Fprintf(os.Stderr, "ERROR: Could not attach shader %s\n...continuing...\n", shader)
		}
	}

	// Link the program
	gl.LinkProgram(ProgramID)

	// Check the program
	var result int32 = gl.TRUE
	//var infoLogLength int32
	gl.GetProgramiv(ProgramID, gl.LINK_STATUS, &result)
	if result != gl.TRUE {
		fmt.Fprintf(os.Stderr, "ERROR: Linking failed!  Details follow...\n")
	}
	/*gl.GetProgramiv(ProgramID, gl.INFO_LOG_LENGTH, &infoLogLength)
	if infoLogLength > 0 {
		programErrorMsg := gl.GLStringAlloc(int32(infoLogLength))
		gl.GetProgramInfoLog(ProgramID, int32(infoLogLength), nil, programErrorMsg)
		fmt.Fprintf(os.Stdout, "Program Info: %s\n", gl.GoString(programErrorMsg))
	}*/
	if result != gl.TRUE {
		return 0
	}

	fmt.Fprintf(os.Stdout, "\nLoadShader completed, ProgramID: %d\n", ProgramID)
	return ProgramID
}
