#version 330 core

out vec4 color;

void main() {
	if (0 == int(gl_FragCoord.y) % 2)
		color = vec4(0.8, 0.3, 0.01, 1);
	else
		color = vec4(0, 0, 0, 1);
}