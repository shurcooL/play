// Play with listing all Go release versions via src-d/go-git.v4.
package main

import (
	"fmt"
	"log"
	"strings"

	"golang.org/x/build/maintner/maintnerd/maintapi/version"
	"gopkg.in/src-d/go-git.v4"
	"gopkg.in/src-d/go-git.v4/config"
	"gopkg.in/src-d/go-git.v4/storage/memory"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	remote := git.NewRemote(memory.NewStorage(), &config.RemoteConfig{
		URLs: []string{"https://go.googlesource.com/go"},
	})

	refs, err := remote.List(&git.ListOptions{})
	if err != nil {
		return err
	}

	type majorMinorPatch struct {
		Major, Minor, Patch int
	}
	var tags []majorMinorPatch
	for _, r := range refs {
		name := string(r.Name())
		if !strings.HasPrefix(name, "refs/tags/") {
			continue
		}
		major, minor, patch, ok := version.ParseTag(name[len("refs/tags/"):])
		if !ok {
			continue
		}
		tags = append(tags, majorMinorPatch{Major: major, Minor: minor, Patch: patch})
	}

	for _, t := range tags {
		fmt.Printf("v%d.%d.%d\n", t.Major, t.Minor, t.Patch)
	}

	return nil
}
