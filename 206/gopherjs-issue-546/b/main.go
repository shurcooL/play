package main

import (
	"github.com/gopherjs/gopherjs/js"
	"golang.org/x/crypto/ed25519"
)

func main() {
	js.Global.Set("ThisTestFails", map[string]interface{}{
		"New": New,
	})
}

func New() *js.Object {
	return js.MakeWrapper(&Testing{})
}

type Testing struct {
	EdPub     []byte
	EdPriv    []byte
	CurvePub  []byte
	CurvePriv []byte
}

func (self *Testing) KeyGen() (pub, priv []byte) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		panic(err)
	}
	self.EdPub = pub
	self.EdPriv = priv
	return pub, priv
}
