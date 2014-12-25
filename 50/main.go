package main

import (
	"log"
	"net/url"

	"golang.org/x/oauth2"
)

func main() {
	thirdParty := oauth2.Config{
		ClientID: "some-string", // A string.
	}
	stdLib := url.URL{
		Path: "some-string", // A string.
	}

	log.Printf("Hello, %s.\n", thirdParty.ClientID) // go vet does _not_ catch this.
	log.Printf("Hello, %s.\n", stdLib.Path)         // But it catches this.
}
