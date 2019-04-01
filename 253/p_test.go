package p_test

import (
	"testing"
	"unicode/utf8"
)

func shortBody(s string) string {
	if len(s) <= 200 {
		return s
	}
	i := 1
	for ; i < utf8.UTFMax && !utf8.RuneStart(s[200-i]); i++ {
	}
	return s[:200-i] + "…"
}

func Test(t *testing.T) {
	for i, tt := range []struct {
		in   string
		want string
	}{
		{
			in:   `GitHub seems to be displaying this comment at an incorrect spot in the discussion tab (it's not the same as in the "Files changed"). I left it on line 61, but it's showing it on line xx1234 here. 😕😕`,
			want: `GitHub seems to be displaying this comment at an incorrect spot in the discussion tab (it's not the same as in the "Files changed"). I left it on line 61, but it's showing it on line xx1234 here. …`,
		},
		{
			in:   `GitHub seems to be displaying this comment at an incorrect spot in the discussion tab (it's not the same as in the "Files changed"). I left it on line 61, but it's showing it on line xx123 here. 😕😕`,
			want: `GitHub seems to be displaying this comment at an incorrect spot in the discussion tab (it's not the same as in the "Files changed"). I left it on line 61, but it's showing it on line xx123 here. 😕…`,
		},
		{
			in:   `GitHub seems to be displaying this comment at an incorrect spot in the discussion tab (it's not the same as in the "Files changed"). I left it on line 61, but it's showing it on line xx1 here. 😕😕`,
			want: `GitHub seems to be displaying this comment at an incorrect spot in the discussion tab (it's not the same as in the "Files changed"). I left it on line 61, but it's showing it on line xx1 here. 😕…`,
		},
		{
			in:   `GitHub seems to be displaying this comment at an incorrect spot in the discussion tab (it's not the same as in the "Files changed"). I left it on line 61, but it's showing it on line xx here. 😕😕`,
			want: `GitHub seems to be displaying this comment at an incorrect spot in the discussion tab (it's not the same as in the "Files changed"). I left it on line 61, but it's showing it on line xx here. 😕😕`,
		},
	} {
		got := shortBody(tt.in)
		if got != tt.want {
			t.Errorf("mismatch on test case %d\n got = %q\nwant = %q", i, got, tt.want)
		}
	}
}
