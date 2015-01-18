package main

import (
	"net/url"

	"azul3d.org/semver.v2"
	"github.com/shurcooL/go-goon"
)

func main() {
	m := semver.GitHub("azul3d")

	u, err := url.Parse("https://" + "azul3d.org/audio.v1/wav")
	if err != nil {
		panic(err)
	}

	repo, err := m.Match(u)
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(repo)
	goon.DumpExpr(repo.Version.String())
}
