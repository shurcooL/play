package main

import (
	"strings"

	"github.com/Jragonmiris/mathgl"
	"github.com/shurcooL/go-goon"
)

type highlightSegment struct {
	offset uint32
	color  mathgl.Vec3d
}

func main() {
	content := "Hi there hi how are you. Hi. Hello."
	findTarget := "there"

	var segments []highlightSegment

	if findTarget == "" {
		return
	}

	var offset uint32
	nonresults := strings.Split(content, findTarget)
	for _, nonresult := range nonresults {
		offset += uint32(len(nonresult))
		segments = append(segments, highlightSegment{offset: offset, color: mathgl.Vec3d{1, 1, 1}})
		offset += uint32(len(findTarget))
		segments = append(segments, highlightSegment{offset: offset, color: mathgl.Vec3d{0, 0, 0}})
	}

	goon.Dump(segments)
}
