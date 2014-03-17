package dedup

import "sort"

var DedupStrings func(orig []string) (dedup []string) = dedupStrings2

// Returns a new slice
func dedupStrings1(orig []string) (dedup []string) {

	exists := make(map[string]bool)

	for _, s := range orig {

		if _, present := exists[s]; !present {
			dedup = append(dedup, s)
			exists[s] = true
		}
	}

	return
}

// Returns a new slice
func dedupStrings1b(orig []string) (dedup []string) {

	exists := make(map[string]struct{}, len(orig))
	dedup = make([]string, 0, len(orig))

	for _, s := range orig {

		if _, present := exists[s]; !present {
			dedup = append(dedup, s)
			exists[s] = struct{}{}
		}
	}
	dedup = dedup[:len(exists)]

	if len(dedup) == 0 {
		return nil
	}

	return
}

func dedupStrings1b_internet(ss []string) (rs []string) {
	rs = make([]string, 0, len(ss))
	visited := map[string]struct{}{}
	for _, s := range ss {
		if _, ok := visited[s]; ok {
			continue
		}
		visited[s] = struct{}{}
		rs = append(rs, s)
	}
	return
}

// Operates on input slice
func dedupStrings1c(orig []string) []string {

	exists := make(map[string]struct{}, len(orig))

	for _, s := range orig {

		if _, present := exists[s]; !present {
			orig[len(exists)] = s
			exists[s] = struct{}{}
		}
	}
	orig = orig[:len(exists)]

	return orig
}

func dedupStrings2(a []string) []string {
	if a == nil || len(a) < 2 {
		return a
	}
	sort.Strings(a)
	prev := a[0]
	j := 1
	n := len(a)
	for i := 1; i < n; i++ {
		curr := a[i]
		if curr == prev {
			continue
		}
		if i != j {
			a[j] = curr
		}
		j += 1
		prev = curr
	}
	if j == n {
		return a
	}
	return a[:j]
}
