var api = require('./API.js');

/**
 * Executes a single step of the tank's programming. The tank can only move,
 * turn, or fire its cannon once per turn. Between each update, the tank's
 * engine remains running and consumes 1 fuel. This function will be called
 * repeatedly until there are no more targets left on the grid, or the tank runs
 * out of fuel.
 */

var DirectionEnum = {
    NORTH: 0,
    EAST: 1,
    SOUTH: 2,
    WEST: 3
};

var TileEnum = {
    UNKNOWN: 0,
    EMPTY: 1,
    OBJECT: 2,
    WALL: 3,
    TARGET: 4,
    ENEMY: 5
};

var StateEnum = {
    INIT: 0,
    ANALYSING_TARGET: 1,
    SEEK_AND_DESTROY_ENEMY: 2,
    SEEK_AND_DESTROY_TARGET: 3,
    SEARCHING_POSITION: 4,
    TAKING_POSITION: 5,
    SEARCHING_ENEMY: 6,
    SEARCHING_TARGET: 7
};

var MAX_DISCOVERY_ROUNDS = 5;
var MAX_HOLDING_POSITION = MAX_DISCOVERY_ROUNDS+10;

var FUEL_TURN = 1;
var FUEL_FORWARD = 1+FUEL_TURN;
var FUEL_BACKWARD = 1+FUEL_TURN;
var FUEL_LEFT = 5+FUEL_TURN;
var FUEL_RIGHT = 5+FUEL_TURN;
var FUEL_ATTACKED = 50;

var gDirection = DirectionEnum.NORTH;
var gMap = [];
var gWidth = 0;
var gHeight = 0;
var gX = 0;
var gY = 0;
var gLidar = [0,0,0,0];

var gLastState = StateEnum.INIT;
var gState = StateEnum.INIT;

var gFuel = 0;
var gRound = 1;

var	gPath = null;
var gCandidates = [];

var gTargetConfirmed = false;
var gAttacked = false;
var gHoldLonger = 0;

//---------------------------------------------------------------------------
// Update Function
//---------------------------------------------------------------------------
exports.update = function() {
	try {
	    if (gState === StateEnum.INIT) {
	    	console.log("Battle begin!");
	    	console.log("======= Round: "+gRound+" =======");
	        initMap();
	    } else {
	    	console.log("======= Round: "+gRound+" =======");
	        updateMap();
	    }
	    if (identifyTarget()) {
	    	if (gTargetConfirmed) {
	    		gState = gLastState;
	    		gHoldLonger += 5;
	        	fireCannon();
	    	}
	    } else {
	        switch(gDirection) {
	            case DirectionEnum.NORTH:
	                setTile(gX,gY+gLidar[gDirection],TileEnum.WALL);
	                break;
	            case DirectionEnum.EAST:
	                setTile(gX+gLidar[gDirection],gY,TileEnum.WALL);
	                break;
	            case DirectionEnum.SOUTH:
	                setTile(gX,gY-gLidar[gDirection],TileEnum.WALL);
	                break;
	            case DirectionEnum.WEST:
	                setTile(gX-gLidar[gDirection],gY,TileEnum.WALL);
	                break;
	        }
	    }
	    if (gState === StateEnum.ANALYSING_TARGET) {
	    	gState = gLastState;
    		console.log("Current State 106: "+gState);
	        throw {isAction: true, action: "Analysing Target"};
	    }
	    if (gState === StateEnum.SEARCHING_POSITION) {
	        console.log("Discovering Position");
	    	discoveringPosition();
	    }
	    if (gState === StateEnum.TAKING_POSITION) {
	    	console.log("Taking Position");
	    	takePosition();
	    }
	    if (gState === StateEnum.SEARCHING_ENEMY) {
	        console.log("Searching Enemy");
	    	lookForEnemy();
	    }
	    if (gState === StateEnum.SEARCHING_TARGET) {
	        console.log("Searching Target");
	    	lookForTarget();
	    }
	    if (gState === StateEnum.SEEK_AND_DESTROY_ENEMY) {
	        console.log("Seek and Destroy !!!");
	    	seekAndDestroy(TileEnum.ENEMY);
	    }
	    if (gState === StateEnum.SEEK_AND_DESTROY_TARGET) {
	        console.log("Seek and Destroy !!!");
	    	seekAndDestroy(TileEnum.TARGET);
	    }
	} catch(e) {
		if (e.isAction) {
			console.log(e.action);
			console.log("Ending turn...");			
		} else {
			throw(e);
		}
	}
};

//---------------------------------------------------------------------------
// Wrapper to API functions
//---------------------------------------------------------------------------

var getLidar = function() {
    gLidar[gDirection] = api.lidarFront();    
    gLidar[(gDirection+1)%4] = api.lidarRight();
    gLidar[(gDirection+2)%4] = api.lidarBack();
    gLidar[(gDirection+3)%4] = api.lidarLeft();
    console.log("Lidar: "+gLidar);
};

var identifyTarget = function() {
	// we confirmed a target if the enemy is on the next tile (both type 1&2)
	// and if we check a progressing enemy (type 2)
	if (api.identifyTarget()) {
		gTargetConfirmed = false;
		if ((gState !== StateEnum.SEEK_AND_DESTROY_ENEMY) && 
			(gState !== StateEnum.SEEK_AND_DESTROY_TARGET)) {
			gLastState = gState;
		}
		gState = StateEnum.ANALYSING_TARGET;
		if (gLidar[gDirection] === 1) {
			gTargetConfirmed = true;
			return true;
		}
		switch(gDirection) {
	        case DirectionEnum.NORTH:
	        	if (gMap[gX][gY+gLidar[gDirection]].value === TileEnum.TARGET) {
	        		gTargetConfirmed = true;
	        	}
	        	if (gMap[gX][gY+gLidar[gDirection]+1].value === TileEnum.ENEMY) {
	        		gTargetConfirmed = true;
	        	}
	            break;
	        case DirectionEnum.EAST:
	        	if (gMap[gX+gLidar[gDirection]][gY].value === TileEnum.TARGET) {
	        		gTargetConfirmed = true;
	        	}
	        	if (gMap[gX+gLidar[gDirection]+1][gY].value === TileEnum.ENEMY) {
	        		gTargetConfirmed = true;
	        	}
	            break;
	        case DirectionEnum.SOUTH:
	        	if (gMap[gX][gY-gLidar[gDirection]].value === TileEnum.TARGET) {
	        		gTargetConfirmed = true;
	        	}
	        	if (gMap[gX][gY-gLidar[gDirection]-1].value === TileEnum.ENEMY) {
	        		gTargetConfirmed = true;
	        	}
	            break;
	        case DirectionEnum.WEST:
	        	if (gMap[gX-gLidar[gDirection]][gY].value === TileEnum.TARGET) {
	        		gTargetConfirmed = true;
	        	}
	        	if (gMap[gX-gLidar[gDirection]-1][gY].value === TileEnum.ENEMY) {
	        		gTargetConfirmed = true;
	        	}
	            break;
		}
		return true;
	} else {
		return false;
	}
};

var fireCannon = function() {
    api.fireCannon();
    throw {isAction: true, action: "Fire !!!"};
};

var moveForward = function() {
    switch(gDirection) {
        case DirectionEnum.NORTH:
            gY++;
            break;
        case DirectionEnum.EAST:
            gX++;
            break;
        case DirectionEnum.SOUTH:
            gY--;
            break;
        case DirectionEnum.WEST:
            gX--;
            break;
    }
    api.moveForward();
    throw {isAction: true, action: "Going Forward!", moved: true};
};

var moveBackward = function() {
    switch(gDirection) {
        case DirectionEnum.NORTH:
        	gY--;
            break;
        case DirectionEnum.EAST:
        	gX--;
            break;
        case DirectionEnum.SOUTH:
        	gY++;
            break;
        case DirectionEnum.WEST:
        	gX++;
            break;
    }
    api.moveBackward();
    throw {isAction: true, action: "Going Backward!", moved: true};
};

var turnLeft = function() {
    gDirection = (gDirection+3)%4;
    api.turnLeft();
    throw {isAction: true, action: "Turning Left!", moved: false};
};

var turnRight = function() {
    gDirection = (gDirection+1)%4;
    api.turnRight();
    throw {isAction: true, action: "Turning Right!", moved: false};
};

//---------------------------------------------------------------------------
// Map Utility functions
//---------------------------------------------------------------------------

var createMap = function(width, height) {
    var result = new Array(width);
    for (var i=0; i<width; i++) {
        var col = new Array(height);
        for (var j=0; j<height; j++) {
            col[j] = { reachable: false, value: TileEnum.UNKNOWN};
        }
        result[i] = col;
    }
    return result;
};

var initMap = function() {
    // scanning in all direction
    getLidar();
    // create the initial map
    gWidth = gLidar[DirectionEnum.EAST]+gLidar[DirectionEnum.WEST]+1;
    gHeight = gLidar[DirectionEnum.NORTH]+gLidar[DirectionEnum.SOUTH]+1;
    gMap = createMap(gWidth,gHeight);
    // init our coordinates
    gX = gLidar[DirectionEnum.WEST];
    gY = gLidar[DirectionEnum.SOUTH];

    // TODO: check if we need this as init.
    gDestTile = {x: gX, y: gY};

    // init the first visible tiles on map
    setTile(gX,0,TileEnum.OBJECT);
    for (var i=1; i<gLidar[DirectionEnum.NORTH]+gLidar[DirectionEnum.SOUTH]; i++) {
    	setTile(gX,i,TileEnum.EMPTY);
    }
    setTile(gX,gLidar[DirectionEnum.NORTH]+gLidar[DirectionEnum.SOUTH],TileEnum.OBJECT);
    setTile(0,gY,TileEnum.OBJECT);
    for (var j=1; j<gLidar[DirectionEnum.EAST]+gLidar[DirectionEnum.WEST]; j++) {
        setTile(j,gY,TileEnum.EMPTY);
    }
    setTile(gLidar[DirectionEnum.EAST]+gLidar[DirectionEnum.WEST],gY,TileEnum.OBJECT);
    
    // switching to next state
    gLastState = gState;
    gState = StateEnum.SEARCHING_POSITION;
    gFuel = api.currentFuel();
    gRound++;

    // print infos
    console.log("x: "+gX+", y: "+gY+" dir: "+gDirection);
    printMap();
    console.log("Starting fuel: "+gFuel);
    console.log("State: "+gState);
    console.log("Last State: "+gLastState);
};

var updateMap = function() {
    var toBeIncreased = false;
    var tX = 0, tY = 0;
    var uX = 0, uY = 0;

    // scanning in all direction
    getLidar();

    // check if border increased
    if (gY-gLidar[DirectionEnum.SOUTH]<0) {
        tY += gLidar[DirectionEnum.SOUTH] - gY;
        toBeIncreased = true;
        console.log("SOUTH: new tY "+tY);
    }
    if (gX-gLidar[DirectionEnum.WEST]<0) {
        tX += gLidar[DirectionEnum.WEST] - gX;
        toBeIncreased = true;
        console.log("WEST: new tX "+tX);
    }
    if (gY+gLidar[DirectionEnum.NORTH]+1>gHeight) {
        uY += gY+gLidar[DirectionEnum.NORTH]+1-gHeight;
        toBeIncreased = true;
        console.log("NORTH: new uY "+uY);
    }
    if (gX+gLidar[DirectionEnum.EAST]+1>gWidth) {
        uX += gX+gLidar[DirectionEnum.EAST]+1-gWidth;
        toBeIncreased = true;
        console.log("EAST: new uX "+uX);
    }
    if (toBeIncreased) {
    	gMap = increaseMap(tX, tY, gWidth+tX+uX, gHeight+tY+uY);
    }
    
    // updating column taking into account previous state
    if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === TileEnum.EMPTY) {
    	gMap[gX][gY-gLidar[DirectionEnum.SOUTH]] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === TileEnum.OBJECT) {
    	gMap[gX][gY-gLidar[DirectionEnum.SOUTH]] = {reachable: true, value: TileEnum.TARGET};
    } else if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === TileEnum.UNKNOWN) {
    	gMap[gX][gY-gLidar[DirectionEnum.SOUTH]] = {reachable: true, value: TileEnum.OBJECT};
    } else {
        //console.log("Problem updating tiles... 1");
    }
    for (var i=gY-gLidar[DirectionEnum.SOUTH]+1; i<gY+gLidar[DirectionEnum.NORTH]; i++) {
        setTile(gX,i,TileEnum.EMPTY);
    }
    if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.EMPTY) {
    	gMap[gX][gY+gLidar[DirectionEnum.NORTH]] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.OBJECT) {
    	gMap[gX][gY+gLidar[DirectionEnum.NORTH]] = {reachable: true, value: TileEnum.TARGET};
    } else if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.UNKNOWN) {
    	gMap[gX][gY+gLidar[DirectionEnum.NORTH]] = {reachable: true, value: TileEnum.OBJECT};
    } else {
        //console.log("Problem updating tiles... 2");
    }

    // updating line taking into account previous state
    if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.EMPTY) {
    	gMap[gX-gLidar[DirectionEnum.WEST]][gY] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.OBJECT) {
    	gMap[gX-gLidar[DirectionEnum.WEST]][gY] = {reachable: true, value: TileEnum.TARGET};
    } else if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.UNKNOWN) {
    	gMap[gX-gLidar[DirectionEnum.WEST]][gY] = {reachable: true, value: TileEnum.OBJECT};
    } else {
        //console.log("Problem updating tiles... 3");
    }
    for (var j=gX-gLidar[DirectionEnum.WEST]+1; j<gX+gLidar[DirectionEnum.EAST]; j++) {
        setTile(j,gY,TileEnum.EMPTY);
    }
    if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === TileEnum.EMPTY) {
    	gMap[gX+gLidar[DirectionEnum.EAST]][gY] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === TileEnum.OBJECT) {
    	gMap[gX+gLidar[DirectionEnum.EAST]][gY] = {reachable: true, value: TileEnum.TARGET};
    } else if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === TileEnum.UNKNOWN) {
    	gMap[gX+gLidar[DirectionEnum.EAST]][gY] = {reachable: true, value: TileEnum.OBJECT};
    } else {
        //console.log("Problem updating tiles... 4");
    }

    if (api.currentFuel() < (gFuel - FUEL_ATTACKED)) {
    	gAttacked = true;
    	console.log("Attacked!!!");
    } else {
    	gAttacked = false;
    }

    gFuel = api.currentFuel();
    gRound++;

    console.log("x: "+gX+", y: "+gY+" dir: "+gDirection);
    printMap();
    console.log("Current fuel: "+gFuel);
    console.log("State: "+gState);
    console.log("Last State: "+gLastState);
};

var setTile = function(x, y, val) {
	if ((gMap[x][y].value === TileEnum.ENEMY) ||
		(gMap[x][y].value === TileEnum.OBJECT)) {
		// only EMPTY value could replace an ENEMY value
		if (val !== TileEnum.EMPTY) {
			console.log("Setting tile value... "+val);
		} else {
			gMap[x][y].enemySpot = true;		
		}
	}
	gMap[x][y].reachable = true;
	gMap[x][y].value = val;
	if (val === TileEnum.EMPTY) {
		gMap[x-1][y].reachable = true;
		gMap[x+1][y].reachable = true;
		gMap[x][y-1].reachable = true;
		gMap[x][y+1].reachable = true;
	}
};

var increaseMap = function(tX, tY, newWidth, newHeight) {
    var result = createMap(newWidth, newHeight);
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            result[i+tX][j+tY] = gMap[i][j];
        }
    }
    gWidth = newWidth;
    gHeight = newHeight;
    gX += tX;
    gY += tY;
    return result;
};

var printMap = function() {
    for(var i=0; i<gHeight; i++) {
        var s = "";
        for (j=0; j<gWidth; j++) {
        	if ((j===gX) && ((gHeight-1-i)===gY)) {
	            s+='X';
        	} else {
	            s+=gMap[j][gHeight-1-i].value;
        	}
        }
        console.log(s);
    }
};

// TODO: rename and optimize to find the closest...
var scanMap = function() {
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            if (gMap[i][j].enemySpot) {
            	return {found: true, tile: {x:i, y:j}};
            }
        }
    }
    return {found: false};
};

var wallMap = function() {
	for (var i = 0; i < gWidth; i++) {
		gMap[i][0].value = TileEnum.WALL;
		gMap[i][gHeight-1].value = TileEnum.WALL;
	};
	for (var i = 0; i < gHeight; i++) {
		gMap[0][i].value = TileEnum.WALL;
		gMap[gWidth-1][i].value = TileEnum.WALL;
	};
	printMap();
}

//---------------------------------------------------------------------------
// Main algorithmic functions
//---------------------------------------------------------------------------

var discoveringPosition = function() {
	if (gRound > MAX_DISCOVERY_ROUNDS) {
		gPath = null;
		gLastState = StateEnum.TAKING_POSITION;
		gState = StateEnum.TAKING_POSITION;
	} else {
		exploreMap();
	}
};

var takePosition = function() {
	if (gPath) {
		performNextStep();
		if (gRound > MAX_HOLDING_POSITION+gHoldLonger) {
			gPath = null;
			gLastState = StateEnum.SEARCHING_ENEMY;
			gState = StateEnum.SEARCHING_ENEMY;
		}
	} else {
		var gTile = computePositionTile();
	    console.log("Taking Position at:");
	    printTile(gTile);
		getPath(gTile.x, gTile.y, tileCandidates);
	    console.log("Position Path:");
	    printPath(gPath);
		performNextStep();
	}
};

var lookForEnemy = function() {
	if (gPath) {
		if (gPath.isArrived) {
			gPath = null;
			gLastState = gState;
			gState = StateEnum.SEEK_AND_DESTROY_ENEMY;
		} else {
			performNextStep();
		}
	} else {
		var gTile = computeNextEnemy();
		if (gTile) {
		    console.log("Next enemy at:");
		    printTile(gTile);
			getPath(gTile.x, gTile.y, tileCandidates);
		    console.log("Next path:");
		    printPath(gPath);
			performNextStep();
		} else {
			exploreMap();
		}
	}
};

var lookForTarget = function() {
	if (gPath) {
		if (gPath.isArrived) {
			gPath = null;
			gLastState = gState;
			gState = StateEnum.SEEK_AND_DESTROY_TARGET;
		} else {
			performNextStep();
		}
	} else {
		var gTile = computeNextTarget();
    	if (gTile) {
		    console.log("Next target at:");
		    printTile(gTile);
			getPath(gTile.x, gTile.y, viewCandidates);
		    console.log("Next path:");
		    printPath(gPath);
			performNextStep();
    	}
	}
};

var exploreMap = function() {
	if (gPath && !gPath.isArrived) {
		performNextStep();
	} else {
    	var gTile = computeNextTile();
    	if (gTile) {
		    console.log("Next destination at:");
		    printTile(gTile);
			getPath(gTile.x, gTile.y, viewCandidates);
		    console.log("Next path:");
		    printPath(gPath);
			performNextStep();
    	}
	}
};

var seekAndDestroy = function(type) {
	if (checkPresence(type)) {
	    switch(gDirection) {
	        case DirectionEnum.NORTH:
	        	console.log("seekAndDestroy NORTH");
	            if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === type) {
	                turnRight();
	            } else {
	                turnLeft();
	            }
	            break;
	        case DirectionEnum.EAST:
	        	console.log("seekAndDestroy EAST");
	            if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === type) {
	                turnRight();
	            } else {
	                turnLeft();
	            }
	            break;
	        case DirectionEnum.SOUTH:
	        	console.log("seekAndDestroy SOUTH");
	            if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === type) {
	                turnRight();
	            } else {
	                turnLeft();
	            }
	            break;
	        case DirectionEnum.WEST:
	        	console.log("seekAndDestroy WEST");
	            if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === type) {
	                turnRight();
	            } else {
	                turnLeft();
	            }
	            break;
	        default:
	        	console.log("seekAndDestroy Unknown direction: "+gDirection);
	    }		
	} else {
		gState = gLastState;
	}
};

//---------------------------------------------------------------------------
// Misc Utility Functions
//---------------------------------------------------------------------------

var printTile = function(tile) {
	console.log(tile.x+","+tile.y);
};

var printPath = function(path) {
    for(var i=0; i<path.steps.length; i++) {
    	var step = i+1;
		console.log("Step "+step);
		printTile(path.steps[i]);        
    }
};

var computeMaxDistance = function(x,y) {
	return Math.max(
		x+y,
		x+gHeight-y-1,
		y+gWidth-x-1,
		gWidth-x-1+gHeight-y-1
	);
};

// TODO: update the part that was deleted (namely check on direct line...)
var checkTargetAtDistance = function(distance, type) {
    switch(gDirection) {
        case DirectionEnum.NORTH:
        	for (i=1; i<=distance; i++) {
		    	if (isTargetReachable(gX-i,gY+distance-i, type)) {
		    		return {found: true, tile:{x:gX-i, y:gY+distance-i}};
		    	}
		    	if (isTargetReachable(gX+i,gY+distance-i, type)) {
		    		return {found: true, tile:{x:gX+i, y:gY+distance-i}};
		    	}
	        	if (isTargetReachable(gX-i,gY-distance+i, type)) {
	        		return {found: true, tile:{x:gX-i, y:gY-distance+i}};
	        	}
	        	if (isTargetReachable(gX+i,gY-distance+i, type)) {
	        		return {found: true, tile:{x:gX+i, y:gY-distance+i}};
	        	}
        	}
            break;
        case DirectionEnum.EAST:
        	for (i=1; i<=distance; i++) {
		    	if (isTargetReachable(gX+distance-i,gY-i, type)) {
		    		return {found: true, tile:{x:gX+distance-i, y:gY-i}};
		    	}
		    	if (isTargetReachable(gX+distance-i,gY+i, type)) {
		    		return {found: true, tile:{x:gX+distance-i, y:gY+i}};
		    	}
	        	if (isTargetReachable(gX-distance+i,gY-i, type)) {
	        		return {found: true, tile:{x:gX-distance+i, y:gY-i}};
	        	}
	        	if (isTargetReachable(gX-distance+i,gY+i, type)) {
	        		return {found: true, tile:{x:gX-distance+i, y:gY+i}};
	        	}
        	}
            break;
        case DirectionEnum.SOUTH:
        	for (i=1; i<=distance; i++) {
	        	if (isTargetReachable(gX-i,gY-distance+i, type)) {
	        		return {found: true, tile:{x:gX-i, y:gY-distance+i}};
	        	}
	        	if (isTargetReachable(gX+i,gY-distance+i, type)) {
	        		return {found: true, tile:{x:gX+i, y:gY-distance+i}};
	        	}
		    	if (isTargetReachable(gX-i,gY+distance-i, type)) {
		    		return {found: true, tile:{x:gX-i, y:gY+distance-i}};
		    	}
		    	if (isTargetReachable(gX+i,gY+distance-i, type)) {
		    		return {found: true, tile:{x:gX+i, y:gY+distance-i}};
		    	}
        	}
            break;
        case DirectionEnum.WEST:
        	for (i=1; i<=distance; i++) {
	        	if (isTargetReachable(gX-distance+i,gY-i, type)) {
	        		return {found: true, tile:{x:gX-distance+i, y:gY-i}};
	        	}
	        	if (isTargetReachable(gX-distance+i,gY+i, type)) {
	        		return {found: true, tile:{x:gX-distance+i, y:gY+i}};
	        	}
		    	if (isTargetReachable(gX+distance-i,gY-i, type)) {
		    		return {found: true, tile:{x:gX+distance-i, y:gY-i}};
		    	}
		    	if (isTargetReachable(gX+distance-i,gY+i, type)) {
		    		return {found: true, tile:{x:gX+distance-i, y:gY+i}};
		    	}
        	}
            break;
    }
    return {found: false};
};

var isTargetReachable = function(x, y, type) {
	if (x<0 || x>=gWidth) {
		return false;
	}
	if (y<0 || y>=gHeight) {
		return false;
	}
	tile = gMap[x][y];
	return (tile.value === type)&&(tile.reachable === true);
};

var isTileReachable = function(x, y) {
	if (x<0 || x>=gWidth) {
		return false;
	}
	if (y<0 || y>=gHeight) {
		return false;
	}
	tile = gMap[x][y];
	return (tile.value === TileEnum.EMPTY)&&(tile.reachable === true);
};

var isCandidate = function(x, y) {
	for (var i=0; i<gCandidates.length; i++) {
		if ((gCandidates[i].x === x) && (gCandidates[i].y === y)) {
			return true;
		}
	}
	return false;
};

var checkPresence = function(type) {
	if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === type) {
		return true;
	}
	if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === type) {
		return true;
	}
	if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === type) {
		return true;
	}
	if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === type) {
		return true;
	}
	return false;
}

//---------------------------------------------------------------------------
// Search Path Algorithms
//---------------------------------------------------------------------------

var computeNextTile = function() {
	var distance = 1;
	var maxDistance = computeMaxDistance(gX,gY);
	var result = {found: false};
	while ((!result.found)&&(distance<=maxDistance)) {
		result = checkTargetAtDistance(distance, TileEnum.UNKNOWN);
		if (result.found) {
			return result.tile;
		}
		distance++;
	}
	gLastState = gState;
	gState = StateEnum.SEARCHING_TARGET;
	// since we have a full map, we can transform the borders into WALL
	wallMap();
	return null;
};

var computeNextEnemy = function() {
	var result = scanMap();
	if (result.found) {
		return result.tile;
	}
	return null;
};

var computeNextTarget = function() {
	var distance = 1;
	var maxDistance = computeMaxDistance(gX,gY);
	var result = {found: false};
	while ((!result.found)&&(distance<=maxDistance)) {
		result = checkTargetAtDistance(distance, TileEnum.OBJECT);
		if (result.found) {
			return result.tile;
		}
		result = checkTargetAtDistance(distance, TileEnum.TARGET);
		if (result.found) {
			return result.tile;
		}
		distance++;
	}
	return null;
};

var computePositionTile = function() {
	var tile = {x:gX, y:gY};
	var maxScore = 0;
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
        	var score = computeScore(i, j);
        	if (score > maxScore) {
        		maxScore = score;
        		tile = {x: i, y: j};
        	}
        }
    }
    return tile;
};

var computeScore = function(x, y) {
	return 0;
};

var initSearch = function() {
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
        	delete gMap[i][j].searched;
        	delete gMap[i][j].fuelUsed;
        	delete gMap[i][j].steps;
        }
    }
	gPath = {found: false, fuelUsed: 0, step: 0, steps: []};
	gCandidates = [];
};

var getPath = function(x, y, candidateFunction) {
	initSearch();
	candidateFunction(x, y);
	if (isCandidate(gX, gY)) {
		gPath = {isArrived: true, found: true, fuelUsed: 0, step: 0, steps: []};
	}
	searchMapForward(gX, gY, gDirection, 0, []);
	searchMapLeft(gX,gY, gDirection, 0, []);
	searchMapRight(gX,gY, gDirection, 0, []);
	searchMapBackward(gX,gY, gDirection, 0, []);
};

var tileCandidates = function(x, y) {
	gCandidates.push({x:x,y:y});
};

// TODO, can be optimized to place highest priority on certain tile depending on direction
var viewCandidates = function(x, y) {
	var i=1;
	while(isTargetReachable(x+i,y, TileEnum.EMPTY)) {
		gCandidates.push({x:x+i,y:y});
		i++;
	}
	i=1;
	while(isTargetReachable(x-i,y, TileEnum.EMPTY)) {
		gCandidates.push({x:x-i,y:y});
		i++;
	}
	i=1;
	while(isTargetReachable(x,y+i, TileEnum.EMPTY)) {
		gCandidates.push({x:x,y:y+i});
		i++;
	}
	i=1;
	while(isTargetReachable(x,y-i, TileEnum.EMPTY)) {
		gCandidates.push({x:x,y:y-i});
		i++;
	}
};

// could be optimized will parallel computing... or taking into account search direction...
var searchMapForward = function(x, y, direction, fuel, path) {
	switch(direction) {
		case DirectionEnum.NORTH:
			y++;
			break;
		case DirectionEnum.SOUTH:
			y--;
			break;
		case DirectionEnum.EAST:
			x++;
			break;
		case DirectionEnum.WEST:
			x--;
			break;
	}
	fuel += FUEL_FORWARD;
	searchMapMove(x, y, direction, fuel, path);
};

var searchMapLeft = function(x, y, direction, fuel, path) {
	switch(direction) {
		case DirectionEnum.NORTH:
			x--;
			break;
		case DirectionEnum.SOUTH:
			x++;
			break;
		case DirectionEnum.EAST:
			y++;
			break;
		case DirectionEnum.WEST:
			y--;
			break;
	}
	direction = (direction+3)%4;
	fuel += FUEL_LEFT;
	searchMapMove(x, y, direction, fuel, path);
};

var searchMapBackward = function(x, y, direction, fuel, path) {
	switch(direction) {
		case DirectionEnum.NORTH:
			y--;
			break;
		case DirectionEnum.SOUTH:
			y++;
			break;
		case DirectionEnum.EAST:
			x--;
			break;
		case DirectionEnum.WEST:
			x++;
			break;
	}
	fuel += FUEL_BACKWARD;
	searchMapMove(x, y, direction, fuel, path);
};

var searchMapRight = function(x, y, direction, fuel, path) {
	switch(direction) {
		case DirectionEnum.NORTH:
			x++;
			break;
		case DirectionEnum.SOUTH:
			x--;
			break;
		case DirectionEnum.EAST:
			y--;
			break;
		case DirectionEnum.WEST:
			y++;
			break;
	}
	direction = (direction+1)%4;
	fuel += FUEL_RIGHT;
	searchMapMove(x, y, direction, fuel, path);
};

var searchMapMove = function(x, y, direction, fuel, path) {
	if (gMap[x][y].value !== TileEnum.EMPTY) {
		return;
	}
	if (!gMap[x][y].searched) {
		path.push({x:x, y:y});
		gMap[x][y].searched = true;
		gMap[x][y].fuelUsed = fuel;
		gMap[x][y].steps = path.slice();
		if (isCandidate(x, y)) {
			if (gPath.found) {
				if (gPath.fuelUsed > fuel) {
					gPath.fuelUsed = fuel;
					gPath.steps = path.slice();
				}				
			} else {
				gPath.found = true;
				gPath.fuelUsed = fuel;
				gPath.steps = path.slice();
			}
			return;
		}
	} else {
		if (gMap[x][y].fuelUsed <= fuel) {
			return;
		}
		path.push({x:x, y:y});
		gMap[x][y].fuelUsed = fuel;
		gMap[x][y].steps = path.slice();
		if (isCandidate(x, y)) {
			if (gPath.found) {
				if (gPath.fuelUsed > fuel) {
					gPath.fuelUsed = fuel;
					gPath.steps = path.slice();
				}				
			} else {
				gPath.found = true;
				gPath.fuelUsed = fuel;
				gPath.steps = path.slice();
			}
			return;
		}
	}
	searchMapForward(x, y, direction, fuel, path.slice());
	searchMapLeft(x, y, direction, fuel, path.slice());
	searchMapRight(x, y, direction, fuel, path.slice());
	searchMapBackward(x, y, direction, fuel, path.slice());	
};

//---------------------------------------------------------------------------
// Moving Functions
//---------------------------------------------------------------------------

var performNextStep = function() {
	if (gPath.steps.length === 0) {
		return;
	}
	var tile = gPath.steps[gPath.step];
	try {
		performMoveTo(tile)
	} catch(e) {
		if (e.moved) {
			gPath.step++;
			if (gPath.step === gPath.steps.length) {
				gPath.isArrived = true;
			}
		}
		throw e;
	}
};

// Can be optimized with Matrices computation probably...
var performMoveTo = function(tile) {
	var goingTo;
	if (tile.x < gX) {
		goingTo = DirectionEnum.WEST;
	} else if (tile.x > gX) {
		goingTo = DirectionEnum.EAST;
	} else if (tile.y < gY) {
		goingTo = DirectionEnum.SOUTH;
	} else if (tile.y > gY) {
		goingTo = DirectionEnum.NORTH;
	} else {
		console.log("Problem in move...");
	}

	switch(gDirection) {
		case DirectionEnum.NORTH:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					moveForward();
					return true;
				case DirectionEnum.SOUTH:
					moveBackward();
					return true;
				case DirectionEnum.EAST:
					turnRight();
					return false;
				case DirectionEnum.WEST:
					turnLeft();
					return false;
			}
		case DirectionEnum.SOUTH:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					moveBackward();
					return true;
				case DirectionEnum.SOUTH:
					moveForward();
					return true;
				case DirectionEnum.EAST:
					turnLeft();
					return false;
				case DirectionEnum.WEST:
					turnRight();
					return false;
			}
		case DirectionEnum.EAST:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					turnLeft();
					return false;
				case DirectionEnum.SOUTH:
					turnRight();
					return false;
				case DirectionEnum.EAST:
					moveForward();
					return true;
				case DirectionEnum.WEST:
					moveBackward();
					return true;
			}
		case DirectionEnum.WEST:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					turnRight();
					return false;
				case DirectionEnum.SOUTH:
					turnLeft();
					return false;
				case DirectionEnum.EAST:
					moveBackward();
					return true;
				case DirectionEnum.WEST:
					moveForward();
					return true;
			}
	}
};

