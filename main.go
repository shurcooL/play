package main

import (
	"bytes"
	"encoding/gob"
	. "gist.github.com/5286084.git"
	"github.com/shurcooL/go-goon"
)

func main() {
	var network bytes.Buffer        // Stand-in for a network connection
	enc := gob.NewEncoder(&network) // Will write to network.
	dec := gob.NewDecoder(&network) // Will read from network.

	// Encode (send) the value.
	err := enc.Encode("Pythagoras")
	CheckError(err)
	
	//goon.Dump(network)

	// Decode (receive) the value.
	var q string
	err = dec.Decode(&q)
	CheckError(err)
	goon.Dump(q)
}