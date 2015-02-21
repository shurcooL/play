// Encode a gob and try to decode it without having original struct.
package main

import (
	"bytes"
	"encoding/gob"
	"fmt"
	"log"
	"github.com/shurcooL/go-goon"
)

var _ = fmt.Printf
var _ gob.GobEncoder
var _ = goon.Dump

type P_named_struct struct {
	X, Y, Z int
	Name    string
	P * P_named_struct
}

func main() {
	// Initialize the encoder and decoder.  Normally enc and dec would be
	// bound to network connections and the encoder and decoder would
	// run in different processes.
	var network bytes.Buffer		// Stand-in for a network connection
	enc := gob.NewEncoder(&network) // Will write to network.
	// Encode (send) the value.
	secret := P_named_struct{3, 4, 5, "Pypypy!", nil}
	err := enc.Encode(secret)
	if err != nil {
		log.Fatal("encode error:", err)
	}
	secret2 := P_named_struct{
		Y: 2,
		Z: 900,
		Name: "Wooohoo :D",
		P: &secret,
	}
	err = enc.Encode(secret2)
	fmt.Printf("%#v", network.Bytes())
	println()
	goon.Dump(secret)
	goon.Dump(secret2)
}