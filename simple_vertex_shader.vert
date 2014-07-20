#version 330 core

in vec4 pv;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

void main() {
	gl_Position = uPMatrix * uMVMatrix * pv;
}
