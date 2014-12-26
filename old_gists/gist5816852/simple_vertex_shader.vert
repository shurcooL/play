#version 410 core

in vec3 aVertexPosition;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

void main() {
	gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
}
