package main

import (
	"net/url"

	"github.com/shurcooL/go-goon"
	"sourcegraph.com/sourcegraph/vcsstore/vcsclient"
)

func main() {
	sg := vcsclient.New(&url.URL{Scheme: "http", Host: "gotools.org:26203"}, nil)

	u, err := url.Parse("https://github.com/azul3d/audio")
	if err != nil {
		panic(err)
	}

	repo, err := sg.Repository("git", u)
	if err != nil {
		panic(err)
	}

	commitId, err := repo.ResolveTag("v1")
	if err != nil {
		panic(err)
	}

	commit, err := repo.GetCommit(commitId)
	if err != nil {
		panic(err)
	}

	goon.DumpExpr(commit)
}
