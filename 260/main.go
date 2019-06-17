// Play with listing all Go release versions via maintner.
package main

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strings"

	"golang.org/x/build/maintner"
	"golang.org/x/build/maintner/godata"
	"golang.org/x/build/maintner/maintnerd/apipb"
	"golang.org/x/build/maintner/maintnerd/maintapi/version"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	corpus, err := godata.Get(context.Background())
	if err != nil {
		return err
	}
	goProj := corpus.Gerrit().Project("go.googlesource.com", "go")
	releases, err := ListGoReleases(goProj)
	if err != nil {
		return err
	}
	for _, r := range releases {
		fmt.Printf("v%d.%d.%d\n", r.Major, r.Minor, r.Patch)
	}
	return nil
}

// nonChangeRefLister is implemented by *maintner.GerritProject,
// or something that acts like it for testing.
type nonChangeRefLister interface {
	// ForeachNonChangeRef calls fn for each git ref on the server that is
	// not a change (code review) ref. In general, these correspond to
	// submitted changes. fn is called serially with sorted ref names.
	// Iteration stops with the first non-nil error returned by fn.
	ForeachNonChangeRef(fn func(ref string, hash maintner.GitHash) error) error
}

func ListGoReleases(goProj nonChangeRefLister) ([]*apipb.GoRelease, error) {
	type (
		majorMinor struct {
			Major, Minor int
		}
		majorMinorPatch struct {
			majorMinor
			Patch int
		}
		tag struct {
			Name   string
			Commit maintner.GitHash
		}
		branch struct {
			Name   string
			Commit maintner.GitHash
		}
	)
	tags := make(map[majorMinorPatch]tag)
	branches := make(map[majorMinor]branch)

	// Iterate over Go tags and release branches.
	err := goProj.ForeachNonChangeRef(func(ref string, hash maintner.GitHash) error {
		switch {
		case strings.HasPrefix(ref, "refs/tags/go"):
			// Tag.
			tagName := ref[len("refs/tags/"):]
			major, minor, patch, ok := version.ParseTag(tagName)
			if !ok {
				return nil
			}
			tags[majorMinorPatch{majorMinor{major, minor}, patch}] = tag{
				Name:   tagName,
				Commit: hash,
			}

		case strings.HasPrefix(ref, "refs/heads/release-branch.go"):
			// Release branch.
			branchName := ref[len("refs/heads/"):]
			major, minor, ok := version.ParseReleaseBranch(branchName)
			if !ok {
				return nil
			}
			branches[majorMinor{major, minor}] = branch{
				Name:   branchName,
				Commit: hash,
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	// A release is considered to exist for each git tag named "goX", "goX.Y", or "goX.Y.Z",
	// as long as it has a corresponding "release-branch.goX" or "release-branch.goX.Y" release branch.
	var rs []*apipb.GoRelease
	for v, t := range tags {
		b, ok := branches[v.majorMinor]
		if !ok {
			// In the unlikely case a tag exists but there's no release branch for it,
			// don't consider it a release. This way, callers won't have to do this work.
			continue
		}
		rs = append(rs, &apipb.GoRelease{
			Major:        int32(v.Major),
			Minor:        int32(v.Minor),
			Patch:        int32(v.Patch),
			TagName:      t.Name,
			TagCommit:    t.Commit.String(),
			BranchName:   b.Name,
			BranchCommit: b.Commit.String(),
		})
	}

	// Sort by version. Latest first.
	sort.Slice(rs, func(i, j int) bool {
		x1, y1, z1 := rs[i].Major, rs[i].Minor, rs[i].Patch
		x2, y2, z2 := rs[j].Major, rs[j].Minor, rs[j].Patch
		if x1 != x2 {
			return x1 > x2
		}
		if y1 != y2 {
			return y1 > y2
		}
		return z1 > z2
	})

	return rs, nil
}
