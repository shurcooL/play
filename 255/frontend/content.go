package main

func renderBodyHTML(path string) string {
	switch path {
	case "/goissues":
		return `
 <b>*Go Issues*</b> | Packages

----------------------------------------------------------------------------------------------------

encoding/b...
=============

Issues and changes for 3 package(s) matching "encoding/b...":

• encoding/base32
• encoding/base64
• encoding/binary

Issues  Changes
======

8 Open  57 Closed
------

✅ encoding/binary: using Write to write a []byte causes unnecessary allocation
   #27757 opened 7 months ago by dominikh

❗ encoding/base64: The current decode implementation is the mixture of RFC2045 and RFC4648
   #25702 opened 10 months ago by spacewander

✅ encoding/binary: Need more helpful error message when writing struct to a buffer rather than a short "invalid type XXX"
   #22860 opened 1 year ago by hallazzang

❗ encoding/base64: make encoding/base64.init() smaller and faster
   #22450 opened 1 year ago by bronze1man

❗ encoding/base64: integer overflow in (*Encoding).EncodedLen
   #20235 opened 2 years ago by ekiru

✅ encoding/base64: encoding is slow
   #20206 opened 2 years ago by markdryan

✅ encoding/base64: decoding is slow
   #19636 opened 2 years ago by josselin-c

❗ encoding/binary: Read (or a new call) should return number of bytes read
   #18585 opened 2 years ago by sayotte







----------------------------------------------------------------------------------------------------

                                                                                     Website Issues
`
	case "/gostatus":
		return `
| Branch                           | Base   | Behind | Ahead |
|----------------------------------|--------|-------:|:------|
| <b>*master*</b>                         | master |      0 | 0     |
| trash/thinking-hash-jump-on-load | master |      9 | 1     |
| wip-takers                       | master |     17 | 1     |
| trash/unneeded-set-RawPath-hint  | master |     21 | 1     |
| trash/css-issuesapp-class        | master |     37 | 1     |
| wip-root-BaseURI                 | master |     72 | 1     |

| Branch                           | Remote        | Behind | Ahead |
|----------------------------------|---------------|-------:|:------|
| <b>*master*</b>                         | origin/master |      0 | 0     |
| trash/thinking-hash-jump-on-load |               |        |       |
| wip-takers                       |               |        |       |
| trash/unneeded-set-RawPath-hint  |               |        |       |
| trash/css-issuesapp-class        |               |        |       |
| wip-root-BaseURI                 |               |        |       |
`
	default:
		return `Usage: visit one of these URLs:

• <a href="/goissues" onclick="Open(this, event)">/goissues</a> - a mock of goissues.org website
• <a href="/gostatus" onclick="Open(this, event)">/gostatus</a> - a mock of gostatus output
`
	}
}
