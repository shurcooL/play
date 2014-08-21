package main

import (
	"log"
	"net/url"

	"github.com/shurcooL/go/exp/13"
)

func main() {
	thirdParty := exp13.VcsLocal{
		Status: "some-string", // A string.
	}
	stdLib := url.URL{
		Path: "some-string", // A string.
	}

	log.Printf("Hello, %d.\n", thirdParty.Status) // go vet does _not_ catch this.
	log.Printf("Hello, %d.\n", stdLib.Path)       // But it catches this.
}
