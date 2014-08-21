package main

import (
	"log"
	"net/url"

	"github.com/golang/oauth2"
)

func main() {
	thirdParty := oauth2.Options{
		ClientID: "some-string", // A string.
	}
	stdLib := url.URL{
		Path: "some-string", // A string.
	}

	log.Printf("Hello, %d.\n", thirdParty.ClientID) // go vet does _not_ catch this.
	log.Printf("Hello, %d.\n", stdLib.Path)         // But it catches this.
}
