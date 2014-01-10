package main

import (
	"io/ioutil"
	"github.com/go3d/go-collada/imp-1.5"
)

func main() {
	//path := "/Users/Dmitri/Dmitri/^Work/^GitHub/Slide/Models/Box.dae"
	path := "/Users/Dmitri/Dropbox/Needs Processing/NewBox.dae"
	if b, err := ioutil.ReadFile(path); err == nil {
		_, _ = collimp.ImportCollada(b, collimp.NewImportBag())
	} else {
		println(err.Error())
	}
}