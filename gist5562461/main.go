// More playing with "encoding/gob".
package main

import (
	"bytes"
	"encoding/gob"

	. "github.com/shurcooL/go/gists/gist5286084"

	"github.com/shurcooL/go-goon"
)

func main() {
	var network bytes.Buffer // Stand-in for a network connection

	type P_named_struct struct {
		X, Y, Z int
		secret  string
		Name    string
		P       *P_named_struct
	}

	// Encode (send) the value.
	{
		encoder := gob.NewEncoder(&network) // Will write to network
		err := encoder.Encode(P_named_struct{
			X:      5,
			Z:      43,
			Name:   "Pythagoras",
			secret: "so secret o.o",
		})
		CheckError(err)
	}

	//goon.Dump(network.Bytes())
	goon.DumpExpr(len(network.Bytes()))
	println()

	// Decode (receive) the value.
	{
		decoder := gob.NewDecoder(&network) // Will read from network
		var o P_named_struct
		err := decoder.Decode(&o)
		CheckError(err)
		goon.Dump(o)
	}
}
