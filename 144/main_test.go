package lib

import (
	"testing"

	"github.com/go-gl/mathgl/mgl32"
)

func TestColHandCheckPlayerPos(t *testing.T) {
	var want = struct {
		noCollision       bool
		oClosestPoint     mgl32.Vec2
		oShortestDistance float32
	}{false, mgl32.Vec2{139, 109.52989}, 3.3006592}

	noCollision, oClosestPoint, oShortestDistance := colHandCheckPlayerPos(&polygon, 135.69934, 109.52989)

	if noCollision != want.noCollision ||
		!oClosestPoint.ApproxEqual(want.oClosestPoint) ||
		!mgl32.FloatEqual(oShortestDistance, want.oShortestDistance) {

		t.Fatalf("colHandCheckPlayerPos returned unexpected results\ngot:\n%v %v %v\nwant:\n%v\n", noCollision, oClosestPoint, oShortestDistance, want)
	}
}

var (
	noCollision       bool
	oClosestPoint     mgl32.Vec2
	oShortestDistance float32
)

func BenchmarkColHandCheckPlayerPos(b *testing.B) {
	for i := 0; i < b.N; i++ {
		noCollision, oClosestPoint, oShortestDistance = colHandCheckPlayerPos(&polygon, 135.69934, 109.52989)
	}
}
