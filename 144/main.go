// Benchmark Go and GopherJS when dealing with lots of func calls and mgl32.Vec2 values.
package lib

import (
	"math"

	"github.com/go-gl/mathgl/mgl32"
	"github.com/go-gl/mathgl/mgl64"
	"github.com/shurcooL/eX0/eX0-go/gpc"
)

const (
	PLAYER_HALF_WIDTH        = 7.74597
	PLAYER_COL_DET_TOLERANCE = 0.005
)

var polygon = (gpc.Polygon)(gpc.Polygon{Contours: ([]gpc.Contour)([]gpc.Contour{(gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-332), (float64)(-203)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-324), (float64)(-203)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-323), (float64)(-154)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-314), (float64)(-153)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-314), (float64)(-204)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-298), (float64)(-203)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-299), (float64)(-269)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-53), (float64)(-269)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-53), (float64)(-296)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(413), (float64)(-296)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(413), (float64)(-9)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(139), (float64)(-9)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(139), (float64)(113)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-67), (float64)(111)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-68), (float64)(87)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-425), (float64)(87)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-425), (float64)(110)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-458), (float64)(109)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-456), (float64)(196)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-514), (float64)(198)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-511), (float64)(337)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-137), (float64)(337)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-137), (float64)(574)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-239), (float64)(574)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-241), (float64)(443)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-249), (float64)(443)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-249), (float64)(433)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-750), (float64)(433)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-750), (float64)(335)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-630), (float64)(335)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-630), (float64)(200)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-729), (float64)(200)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-729), (float64)(107)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-750), (float64)(107)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-750), (float64)(68)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-730), (float64)(68)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-730), (float64)(34)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-409), (float64)(34)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-410), (float64)(-39)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-419), (float64)(-61)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-750), (float64)(-61)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-750), (float64)(-271)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-661), (float64)(-272)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-660), (float64)(-441)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-685), (float64)(-441)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-685), (float64)(-425)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-750), (float64)(-425)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-750), (float64)(-628)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-657), (float64)(-627)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-659), (float64)(-721)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-750), (float64)(-721)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-750), (float64)(-750)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-631), (float64)(-750)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-628), (float64)(-648)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-608), (float64)(-647)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-608), (float64)(-750)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-499), (float64)(-750)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-499), (float64)(-650)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-253), (float64)(-650)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-253), (float64)(-561)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-478), (float64)(-491)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-496), (float64)(-491)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-496), (float64)(-444)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-553), (float64)(-431)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-553), (float64)(-273)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-470), (float64)(-273)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-470), (float64)(-284)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-332), (float64)(-284)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-331), (float64)(-98)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-319), (float64)(-98)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-293), (float64)(-147)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-285), (float64)(-144)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-306), (float64)(-98)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-296), (float64)(-98)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-296), (float64)(-54)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-69), (float64)(-54)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-68), (float64)(35)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-354), (float64)(35)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-354), (float64)(-36)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-348), (float64)(-60)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-331), (float64)(-60)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-224), (float64)(-57)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-224), (float64)(-119)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-166), (float64)(-118)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-166), (float64)(-56)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-429), (float64)(-64)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-505), (float64)(-65)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-505), (float64)(-141)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-429), (float64)(-141)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-512), (float64)(-67)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-512), (float64)(-97)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-546), (float64)(-97)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-546), (float64)(-67)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-47), (float64)(-247)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-48), (float64)(-289)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-4), (float64)(-289)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-5), (float64)(-245)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(81), (float64)(-290)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(82), (float64)(-247)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(129), (float64)(-249)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(130), (float64)(-291)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(138), (float64)(-288)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(138), (float64)(-256)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(168), (float64)(-257)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(169), (float64)(-287)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(168), (float64)(-250)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(136), (float64)(-246)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(136), (float64)(-210)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(171), (float64)(-212)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(269), (float64)(-292)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(268), (float64)(-263)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(297), (float64)(-264)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(295), (float64)(-291)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-724), (float64)(194)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-724), (float64)(148)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-675), (float64)(147)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-675), (float64)(194)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-666), (float64)(194)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-665), (float64)(168)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-644), (float64)(168)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-644), (float64)(193)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-445), (float64)(105)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-431), (float64)(105)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-432), (float64)(93)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-446), (float64)(93)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-483), (float64)(343)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-484), (float64)(367)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-452), (float64)(368)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-451), (float64)(344)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-443), (float64)(339)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-442), (float64)(363)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-421), (float64)(361)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-421), (float64)(341)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-690), (float64)(338)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-689), (float64)(368)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-657), (float64)(368)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-659), (float64)(339)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-698), (float64)(338)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-697), (float64)(355)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-715), (float64)(357)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-716), (float64)(340)})})}), (gpc.Contour)(gpc.Contour{Vertices: ([]mgl64.Vec2)([]mgl64.Vec2{(mgl64.Vec2)(mgl64.Vec2{(float64)(-727), (float64)(339)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-725), (float64)(352)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-739), (float64)(352)}), (mgl64.Vec2)(mgl64.Vec2{(float64)(-738), (float64)(339)})})})})})

// checks to see if player pos is ok, or inside a wall
func colHandCheckPlayerPos(polygon *gpc.Polygon, fX, fY float32) (noCollision bool, oClosestPoint mgl32.Vec2, oShortestDistance float32) {
	var oVector mgl32.Vec2
	var oSegment Seg2
	var oParam float32
	var oDistance float32

	oShortestDistance = math.MaxFloat32

	for iLoop1 := 0; iLoop1 < len(polygon.Contours); iLoop1++ {
		for iLoop2 := 1; iLoop2 < len(polygon.Contours[iLoop1].Vertices); iLoop2++ {

			oVector[0] = float32(polygon.Contours[iLoop1].Vertices[iLoop2-1][0])
			oVector[1] = float32(polygon.Contours[iLoop1].Vertices[iLoop2-1][1])
			oSegment.Origin = oVector
			oVector[0] = float32(polygon.Contours[iLoop1].Vertices[iLoop2][0]) - oVector[0]
			oVector[1] = float32(polygon.Contours[iLoop1].Vertices[iLoop2][1]) - oVector[1]
			oSegment.Direction = oVector
			oVector[0] = fX
			oVector[1] = fY

			// make sure the distance we're looking for is possible
			//if !ColHandIsSegmentCloseToCircle2(oVector[0], oVector[1], PLAYER_HALF_WIDTH+PLAYER_COL_DET_TOLERANCE, &oSegment) {
			if !ColHandIsSegmentCloseToCircle(oVector[0], oVector[1], PLAYER_HALF_WIDTH+PLAYER_COL_DET_TOLERANCE, oSegment) {
				continue
			}

			// Calculate the distance.
			oDistance = distance(oVector, oSegment, &oParam)

			if oDistance < PLAYER_HALF_WIDTH-PLAYER_COL_DET_TOLERANCE && oDistance < oShortestDistance {
				oShortestDistance = oDistance
				oClosestPoint = oSegment.Origin.Add(oSegment.Direction.Mul(oParam))
			}
		}

		// Don't do the last segment for test brevity.
	}

	if oShortestDistance < PLAYER_HALF_WIDTH-PLAYER_COL_DET_TOLERANCE {
		return false, oClosestPoint, oShortestDistance
	} else {
		return true, mgl32.Vec2{}, 0
	}
}

// Seg2 represents a line segement with origin and direction vectors.
type Seg2 struct {
	Origin    mgl32.Vec2
	Direction mgl32.Vec2
}

func distance(point mgl32.Vec2, segment Seg2, param *float32) float32 {
	kDiff := point.Sub(segment.Origin)
	fT := kDiff.Dot(segment.Direction)

	if fT <= 0.0 {
		fT = 0.0
	} else {
		fLen := segment.Direction.Len()
		fSqrLen := fLen * fLen
		if fT >= fSqrLen {
			fT = 1.0
			kDiff = kDiff.Sub(segment.Direction)
		} else {
			fT /= fSqrLen
			kDiff = kDiff.Sub(segment.Direction.Mul(fT))
		}
	}

	if param != nil {
		*param = fT
	}

	return kDiff.Len()
}

// returns whether a segment is close to a circle
func ColHandIsSegmentCloseToCircle(fX, fY, fRadius float32, oSegment Seg2) bool {
	return colHandIsSegmentCloseToCircle(fX, fY, fRadius,
		oSegment.Origin.X(), oSegment.Origin.Y(),
		oSegment.Origin.Add(oSegment.Direction).X(), oSegment.Origin.Add(oSegment.Direction).Y())
}
func colHandIsSegmentCloseToCircle(fX, fY, fRadius, fStartX, fStartY, fEndX, fEndY float32) bool {
	return !((fStartX < fX-fRadius && fEndX < fX-fRadius) ||
		(fStartX > fX+fRadius && fEndX > fX+fRadius) ||
		(fStartY < fY-fRadius && fEndY < fY-fRadius) ||
		(fStartY > fY+fRadius && fEndY > fY+fRadius))
}

// This version is much faster for GopherJS (but not faster for Go) because:
//
// 1. It uses a pointer for Seg2 parameter, so it's not copied.
// 2. It inlines the helper func inside, so less copying parameters for func calls.
// 3. It avoids using Vec2.Add() but rather does the math... also inlined... Which means less allocating/copying values.
func ColHandIsSegmentCloseToCircle2(fX, fY, fRadius float32, oSegment *Seg2) bool {
	var (
		fStartX = oSegment.Origin[0]
		fStartY = oSegment.Origin[1]
		fEndX   = oSegment.Origin[0] + oSegment.Direction[0]
		fEndY   = oSegment.Origin[1] + oSegment.Direction[1]
	)

	return !((fStartX < fX-fRadius && fEndX < fX-fRadius) ||
		(fStartX > fX+fRadius && fEndX > fX+fRadius) ||
		(fStartY < fY-fRadius && fEndY < fY-fRadius) ||
		(fStartY > fY+fRadius && fEndY > fY+fRadius))
}
