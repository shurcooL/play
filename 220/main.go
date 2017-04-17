// Benchmark program for https://github.com/gopherjs/gopherjs/pull/628.
// Based on code from github.com/shurcooL/Hover.
package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"time"
)

func main() {
	started := time.Now()
	_, err := LoadTrack("track1.dat")
	taken := time.Since(started)
	fmt.Println("error:", err)
	fmt.Println("taken:", taken)
}

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
}

func LoadTrack(path string) (*Track, error) {
	file, err := open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var track Track

	err = binary.Read(file, binary.LittleEndian, &track.TrackFileHeader)
	if err != nil {
		return nil, err
	}

	// Stuff derived from header info.
	track.NumTerrCoords = uint32(track.Width) * uint32(track.Depth)
	track.TriGroupsWidth = (uint32(track.Width) - 1) >> TRIGROUP_WIDTHSHIFT
	track.TriGroupsDepth = (uint32(track.Depth) - 1) >> TRIGROUP_WIDTHSHIFT
	track.NumTriGroups = track.TriGroupsWidth * track.TriGroupsDepth

	track.TerrTypeTextureFilenames = make([]string, track.NumTerrTypes)
	for i := uint16(0); i < track.NumTerrTypes; i++ {
		var terrTypeTextureFilename [32]byte
		err = binary.Read(file, binary.LittleEndian, &terrTypeTextureFilename)
		if err != nil {
			return nil, err
		}
		track.TerrTypeTextureFilenames[i] = cStringToGoString(terrTypeTextureFilename[:])
	}

	track.TerrTypeRuns = make([]TerrTypeNode, track.Depth)
	err = binary.Read(file, binary.LittleEndian, &track.TerrTypeRuns)
	if err != nil {
		return nil, err
	}

	track.TerrTypeNodes = make([]TerrTypeNode, track.NumTerrTypeNodes)
	err = binary.Read(file, binary.LittleEndian, &track.TerrTypeNodes)
	if err != nil {
		return nil, err
	}

	track.NavCoords = make([]NavCoord, track.NumNavCoords)
	err = binary.Read(file, binary.LittleEndian, &track.NavCoords)
	if err != nil {
		return nil, err
	}

	track.NavCoordLookupRuns = make([]NavCoordLookupNode, track.Depth)
	err = binary.Read(file, binary.LittleEndian, &track.NavCoordLookupRuns)
	if err != nil {
		return nil, err
	}

	track.NavCoordLookupNodes = make([]NavCoordLookupNode, track.NumNavCoordLookupNodes)
	err = binary.Read(file, binary.LittleEndian, &track.NavCoordLookupNodes)
	if err != nil {
		return nil, err
	}

	track.TerrCoords = make([]TerrCoord, track.NumTerrCoords)
	err = binary.Read(file, binary.LittleEndian, &track.TerrCoords)
	if err != nil {
		return nil, err
	}

	track.TriGroups = make([]TriGroup, track.NumTriGroups)
	err = binary.Read(file, binary.LittleEndian, &track.TriGroups)
	if err != nil {
		return nil, err
	}

	// Check that we've consumed the entire track file.
	if n, err := io.Copy(ioutil.Discard, file); err != nil {
		return nil, err
	} else if n > 0 {
		return nil, fmt.Errorf("LoadTrack: did not get to end of track file, %d bytes left", n)
	}

	return &track, nil
}

// open opens a named asset. It's the caller's responsibility to close it when done.
func open(name string) (io.ReadCloser, error) {
	resp, err := http.Get(name)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("non-200 status: %s", resp.Status)
	}
	return resp.Body, nil
}

func cStringToGoString(cString []byte) string {
	i := bytes.IndexByte(cString, 0)
	if i < 0 {
		return ""
	}
	return string(cString[:i])
}
