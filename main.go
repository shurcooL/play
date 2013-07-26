package main

import (
	"bytes"
	"encoding/gob"
	. "gist.github.com/5286084.git"
	"github.com/shurcooL/go-goon"
)

func main() {
	var network bytes.Buffer            // Stand-in for a network connection
	encoder := gob.NewEncoder(&network) // Will write to network
	decoder := gob.NewDecoder(&network) // Will read from network

	// Encode (send) the value.
	{
		err := encoder.Encode("Pythagoras")
		CheckError(err)
		encoder.Encode(43)
	}

	goon.Dump(network.Bytes())
	println()

	// Decode (receive) the value.
	{
		var s string
		err := decoder.Decode(&s)
		CheckError(err)
		var i int
		decoder.Decode(&i)
		goon.Dump(s, i)
	}
}