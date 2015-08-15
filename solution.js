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
    SEARCHING_POSITION: 1,
    TAKING_POSITION: 2,
    SEARCHING_ENEMY: 3,
    SEARCHING_TARGET: 4
};

var MAX_DISCOVERY_ROUNDS = 7;
var MAX_HOLDING_POSITION = MAX_DISCOVERY_ROUNDS+15;
var MAX_HOLDING_INCREASE = 2;

var FUEL_TURN = 1;
var FUEL_FORWARD = 1+FUEL_TURN;
var FUEL_BACKWARD = 1+FUEL_TURN;
var FUEL_LEFT = 1+FUEL_TURN+1;
var FUEL_RIGHT = 1+FUEL_TURN+1;
var FUEL_ATTACKED = 50;

var gDirection = DirectionEnum.NORTH;
var gMap = [];
var gWidth = 0;
var gHeight = 0;
var gX = 0;
var gY = 0;
var gLidar = [0,0,0,0];

var gState = StateEnum.INIT;

var gFuel = 0;
var gRound = 1;

var	gPath = null;
var gCandidates = [];
var gAvoidTarget = true;

var gAttacked = false;
var gHoldLonger = 0;

// TODO: if an object is inside the map, it could be worth to identify it ASAP
// TODO: during searching enemy phase, make a choice between next enemy and exploration depending on distance
// TODO: during enemy phase, viewCondition is not sufficient, we must explore each segment (vertical and horizontal) once!
// TODO: take into account gAttacked !!

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
	    if (gState === StateEnum.SEARCHING_POSITION) {
	        console.log("Discovering Position");
	    	while (gState === StateEnum.SEARCHING_POSITION) {
		    	seekAndDestroy(TileEnum.ENEMY);
	    		discoveringPosition();
	    	}
	    }
	    if (gState === StateEnum.TAKING_POSITION) {
		    console.log("Taking Position");
	    	while (gState === StateEnum.TAKING_POSITION) {
		        console.log("Seek and Destroy!!!");
		    	seekAndDestroy(TileEnum.ENEMY);
		    	takePosition();
		    }
	    }
	    if (gState === StateEnum.SEARCHING_ENEMY) {
		    console.log("Searching Enemy");
	    	while (gState === StateEnum.SEARCHING_ENEMY) {
		        console.log("Seek and Destroy!!!");
		    	seekAndDestroy(TileEnum.ENEMY);
		    	seekAndDestroy(TileEnum.OBJECT);
		    	seekAndDestroy(TileEnum.TARGET);
		    	lookForEnemy();
	    	}
	    }
	    if (gState === StateEnum.SEARCHING_TARGET) {
		    console.log("Searching Target");
	    	while (gState === StateEnum.SEARCHING_TARGET) {
				gAvoidTarget = false;
		        console.log("Seek and Destroy!!!");
			    seekAndDestroy(TileEnum.TARGET);
		    	lookForTarget();
			}
	    }
	} catch(e) {
		if (e.isAction) {
			console.log(e.action);
			console.log("Ending turn...");			
		} else {
			console.log("Shit happened...");
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
		var x = 0;
		var y = 0;
	    switch(gDirection) {
	        case DirectionEnum.NORTH:
	        	x = gX;
	        	y = gY+gLidar[gDirection];
	            break;
	        case DirectionEnum.EAST:
	        	x = gX+gLidar[gDirection];
	        	y = gY;
	            break;
	        case DirectionEnum.SOUTH:
	        	x = gX;
	        	y = gY-gLidar[gDirection];
	            break;
	        case DirectionEnum.WEST:
	        	x = gX-gLidar[gDirection];
	        	y = gY;
	            break;
	    }
	    var value = gMap[x][y].value;

	    if (value === TileEnum.ENEMY) {
	    	gTargetConfirmed = true;
	    } else {
	    	if (gLidar[gDirection] === 1) {
	    		gTargetConfirmed = true;
	    	} else {
	    		if (gAvoidTarget) {
				    switch(gDirection) {
				        case DirectionEnum.NORTH:
				        	gTargetConfirmed =  (y !== gHeight-1);
				        	break;
				        case DirectionEnum.EAST:
				        	gTargetConfirmed =  (x !== gWidth-1);
				        	break;
				        case DirectionEnum.SOUTH:
				        	gTargetConfirmed =  (y !== 0);
				        	break;
				        case DirectionEnum.WEST:
				        	gTargetConfirmed =  (x !== 0);
				        	break;
				    }	    			
	    		} else {
	    			gTargetConfirmed = true;
	    		}
	    	}
	    }
	    return true;
	} else {
		return false;
	}
};

var fireCannon = function() {
	gHoldLonger += MAX_HOLDING_INCREASE;
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
    gState = StateEnum.SEARCHING_POSITION;
    gFuel = api.currentFuel();
    gRound++;

    // print infos
    console.log("x: "+gX+", y: "+gY+" dir: "+gDirection);
    printMap();
    console.log("Starting fuel: "+gFuel);
    console.log("State: "+gState);
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
    } else if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === TileEnum.OBJECT &&
    	gLidar[DirectionEnum.SOUTH] > 1) {
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
    } else if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.OBJECT &&
    	gLidar[DirectionEnum.NORTH] > 1) {
    	gMap[gX][gY+gLidar[DirectionEnum.NORTH]] = {reachable: true, value: TileEnum.TARGET};
    } else if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === TileEnum.UNKNOWN) {
    	gMap[gX][gY+gLidar[DirectionEnum.NORTH]] = {reachable: true, value: TileEnum.OBJECT};
    } else {
        //console.log("Problem updating tiles... 2");
    }

    // updating line taking into account previous state
    if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.EMPTY) {
    	gMap[gX-gLidar[DirectionEnum.WEST]][gY] = {reachable: true, value: TileEnum.ENEMY};
    } else if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === TileEnum.OBJECT && 
    	gLidar[DirectionEnum.WEST] > 1) {
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
    } else if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === TileEnum.OBJECT &&
    	gLidar[DirectionEnum.EAST] > 1) {
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
};

var increaseMap = function(tX, tY, newWidth, newHeight) {
    var result = createMap(newWidth, newHeight);
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            result[i+tX][j+tY] = gMap[i][j];
        }
    }
    if (gPath) {
    	for (var i = 0; i < gPath.steps.length; i++) {
    		gPath.steps[i].x += tX;
    		gPath.steps[i].x += tY;
    	};
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
        	if (gMap[j][gHeight-1-i].reachable) {
        		s+='.';
        	} else {
        		s+=' ';
        	}
        	if ((j===gX) && ((gHeight-1-i)===gY)) {
	            s+='X';
        	} else if (gMap[j][gHeight-1-i].enemySpot) {
        		if (gMap[j][gHeight-1-i].value === TileEnum.ENEMY) {
	            	s+='E';
				} else {
	        		s+='S';					
				}
        	} else {
	            s+=gMap[j][gHeight-1-i].value;
        	}
        }
        console.log(s);
    }
};

// TODO to be removed...
var wallMap = function() {
	for (var i = 0; i < gWidth; i++) {
		gMap[i][0].value = TileEnum.WALL;
		gMap[i][gHeight-1].value = TileEnum.WALL;
	}
	for (var j = 0; j < gHeight; j++) {
		gMap[0][j].value = TileEnum.WALL;
		gMap[gWidth-1][j].value = TileEnum.WALL;
	}
	printMap();
};

//---------------------------------------------------------------------------
// Main algorithmic functions
//---------------------------------------------------------------------------

var discoveringPosition = function() {
	if (gRound > MAX_DISCOVERY_ROUNDS) {
		gPath = null;
		gState = StateEnum.TAKING_POSITION;
	} else {
		exploreMap();
	}
};

var takePosition = function() {
	if (gPath) {
		if (!gPath.isArrived) {
			performNextStep();
		} else {
			var direction = computeOrientation();
	    	console.log("Orientating Position to: "+direction);
			performOrientation(direction);
		}
		if (gRound > MAX_HOLDING_POSITION+gHoldLonger) {
			gPath = null;
			gState = StateEnum.SEARCHING_ENEMY;
		}
    	throw {isAction: true, action: "Waiting Enemy !!!"};
	} else {
		var gTile = computePositionTile();
	    console.log("Taking Position at:");
	    printTile(gTile);
		getPath(gTile.x, gTile.y, tileCandidates);
	    console.log("Position Path:");
	    printPath(gPath);
		//performNextStep();
	}
};

var lookForEnemy = function() {
	if (gPath) {
		if (gPath.isArrived) {
			gPath = null;
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
			//performNextStep();
		} else {
			exploreMap();
		}
	}
};

var lookForTarget = function() {
	if (gPath) {
		if (gPath.isArrived) {
			gPath = null;
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
			//performNextStep();
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
			//performNextStep();
    	}
	}
};

var seekAndDestroy = function(type) {
	if (checkPresence(type)) {
	    switch(gDirection) {
	        case DirectionEnum.NORTH:
	        	console.log("seekAndDestroy NORTH");
	            if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === type &&
	            	gX+gLidar[DirectionEnum.EAST] !== gWidth-1) {
	                turnRight();
	            } else {
	                turnLeft();
	            }
	            break;
	        case DirectionEnum.EAST:
	        	console.log("seekAndDestroy EAST");
	            if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === type &&
	            	gY-gLidar[DirectionEnum.SOUTH] !== 0) {
	                turnRight();
	            } else {
	                turnLeft();
	            }
	            break;
	        case DirectionEnum.SOUTH:
	        	console.log("seekAndDestroy SOUTH");
	            if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === type &&
	            	gX-gLidar[DirectionEnum.WEST] !== 0) {
	                turnRight();
	            } else {
	                turnLeft();
	            }
	            break;
	        case DirectionEnum.WEST:
	        	console.log("seekAndDestroy WEST");
	            if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === type &&
	            	gY+gLidar[DirectionEnum.NORTH] !== gHeight-1) {
	                turnRight();
	            } else {
	                turnLeft();
	            }
	            break;
	        default:
	        	console.log("seekAndDestroy Unknown direction: "+gDirection);
	    }		
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

var checkTile = function(x, y, type) {
	if (x<0 || x>=gWidth) {
		return false;
	}
	if (y<0 || y>=gHeight) {
		return false;
	}
	tile = gMap[x][y];
	return (tile.value === type);
};

var setTile = function(x, y, val) {
	if (gMap[x][y].value === TileEnum.ENEMY) {
		// only EMPTY value could replace an ENEMY value
		if (val !== TileEnum.EMPTY) {
			console.log("Setting tile value... "+val);
		} else {
			gMap[x][y].enemySpot = true;		
		}
	}
	gMap[x][y].value = val;
	if (val === TileEnum.EMPTY) {
		gMap[x-1][y].reachable = true;
		gMap[x+1][y].reachable = true;
		gMap[x][y-1].reachable = true;
		gMap[x][y+1].reachable = true;
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

var checkTileAtDistance = function(distance, type) {
    switch(gDirection) {
        case DirectionEnum.NORTH:
	    	if (!isTileChecked(gX,gY+distance) || isTileReachable(gX,gY+distance, type)) {
	    		return {found: true, tile:{x:gX, y:gY+distance}};
	    	}
	    	if (isTileReachable(gX,gY-distance, type)) {
	    		return {found: true, tile:{x:gX, y:gY-distance}};
	    	}
        	for (i=1; i<=distance; i++) {
		    	if (isTileReachable(gX-i,gY+distance-i, type)) {
		    		return {found: true, tile:{x:gX-i, y:gY+distance-i}};
		    	}
		    	if (isTileReachable(gX+i,gY+distance-i, type)) {
		    		return {found: true, tile:{x:gX+i, y:gY+distance-i}};
		    	}
	        	if (isTileReachable(gX-i,gY-distance+i, type)) {
	        		return {found: true, tile:{x:gX-i, y:gY-distance+i}};
	        	}
	        	if (isTileReachable(gX+i,gY-distance+i, type)) {
	        		return {found: true, tile:{x:gX+i, y:gY-distance+i}};
	        	}
        	}
            break;
        case DirectionEnum.EAST:
	    	if (isTileReachable(gX+distance,gY, type)) {
	    		return {found: true, tile:{x:gX+distance, y:gY}};
	    	}
	    	if (isTileReachable(gX-distance,gY, type)) {
	    		return {found: true, tile:{x:gX-distance, y:gY}};
	    	}
        	for (i=1; i<=distance; i++) {
		    	if (isTileReachable(gX+distance-i,gY-i, type)) {
		    		return {found: true, tile:{x:gX+distance-i, y:gY-i}};
		    	}
		    	if (isTileReachable(gX+distance-i,gY+i, type)) {
		    		return {found: true, tile:{x:gX+distance-i, y:gY+i}};
		    	}
	        	if (isTileReachable(gX-distance+i,gY-i, type)) {
	        		return {found: true, tile:{x:gX-distance+i, y:gY-i}};
	        	}
	        	if (isTileReachable(gX-distance+i,gY+i, type)) {
	        		return {found: true, tile:{x:gX-distance+i, y:gY+i}};
	        	}
        	}
            break;
        case DirectionEnum.SOUTH:
	    	if (isTileReachable(gX,gY-distance, type)) {
	    		return {found: true, tile:{x:gX, y:gY-distance}};
	    	}
	    	if (isTileReachable(gX,gY+distance, type)) {
	    		return {found: true, tile:{x:gX, y:gY+distance}};
	    	}
        	for (i=1; i<=distance; i++) {
	        	if (isTileReachable(gX-i,gY-distance+i, type)) {
	        		return {found: true, tile:{x:gX-i, y:gY-distance+i}};
	        	}
	        	if (isTileReachable(gX+i,gY-distance+i, type)) {
	        		return {found: true, tile:{x:gX+i, y:gY-distance+i}};
	        	}
		    	if (isTileReachable(gX-i,gY+distance-i, type)) {
		    		return {found: true, tile:{x:gX-i, y:gY+distance-i}};
		    	}
		    	if (isTileReachable(gX+i,gY+distance-i, type)) {
		    		return {found: true, tile:{x:gX+i, y:gY+distance-i}};
		    	}
        	}
            break;
        case DirectionEnum.WEST:
	    	if (isTileReachable(gX-distance,gY, type)) {
	    		return {found: true, tile:{x:gX-distance, y:gY}};
	    	}
	    	if (isTileReachable(gX+distance,gY, type)) {
	    		return {found: true, tile:{x:gX+distance, y:gY}};
	    	}
        	for (i=1; i<=distance; i++) {
	        	if (isTileReachable(gX-distance+i,gY-i, type)) {
	        		return {found: true, tile:{x:gX-distance+i, y:gY-i}};
	        	}
	        	if (isTileReachable(gX-distance+i,gY+i, type)) {
	        		return {found: true, tile:{x:gX-distance+i, y:gY+i}};
	        	}
		    	if (isTileReachable(gX+distance-i,gY-i, type)) {
		    		return {found: true, tile:{x:gX+distance-i, y:gY-i}};
		    	}
		    	if (isTileReachable(gX+distance-i,gY+i, type)) {
		    		return {found: true, tile:{x:gX+distance-i, y:gY+i}};
		    	}
        	}
            break;
    }
    return {found: false};
};

var isTileReachable = function(x, y, type) {
	if (x<0 || x>=gWidth) {
		return false;
	}
	if (y<0 || y>=gHeight) {
		return false;
	}
	tile = gMap[x][y];
	return (tile.value === type) && (tile.reachable === true);
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
	if (type !== TileEnum.ENEMY) {
		if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === type &&
			gY+gLidar[DirectionEnum.NORTH] !== gHeight-1) {
			console.log("1");
			return true;
		}
		if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === type &&
			gY-gLidar[DirectionEnum.SOUTH] !== 0) {
			console.log("2");
			return true;
		}
		if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === type &&
			gX+gLidar[DirectionEnum.EAST] !== gWidth-1) {
			console.log("3");
			return true;
		}
		if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === type &&
			gX-gLidar[DirectionEnum.WEST] !== 0) {
			console.log("4");
			return true;
		}
		return false;
	} else {
		if (gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value === type) {
			console.log("5");
			return true;
		}
		if (gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value === type) {
			console.log("6");
			return true;
		}
		if (gMap[gX+gLidar[DirectionEnum.EAST]][gY].value === type) {
			console.log("7");
			return true;
		}
		if (gMap[gX-gLidar[DirectionEnum.WEST]][gY].value === type) {
			console.log("8");
			return true;
		}
		return false;		
	}
};

var deleteEnemySpot = function(x, y) {
	delete gMap[x][y].enemySpot;
	var i=1;
	while(x+i<gWidth) {
		delete gMap[x+i][y].enemySpot;
		i++;
	}
	i=1;
	while(x-i>=0) {
		delete gMap[x-i][y].enemySpot;
		i++;
	}
	i=1;
	while(y+i<gHeight) {
		delete gMap[x][y+i].enemySpot;
		i++;
	}
	i=1;
	while(y-i>=0) {
		delete gMap[x][y-i].enemySpot;
		i++;
	}
};

//---------------------------------------------------------------------------
// Search Path Algorithms
//---------------------------------------------------------------------------

var computeNextTile = function() {
	var distance = 1;
	var maxDistance = computeMaxDistance(gX,gY);
	var result = {found: false};
	while ((!result.found)&&(distance<=maxDistance)) {
		result = checkTileAtDistance(distance, TileEnum.UNKNOWN);
		if (result.found) {
			return result.tile;
		}
		distance++;
	}
	gState = StateEnum.SEARCHING_TARGET;
	// since we have a full map, we can transform the borders into WALL
	// wallMap();
	return null;
};

var computeNextEnemy = function() {
	var result = scanEnemy();
	if (result.length !== 0) {
		console.log("Scanning resut:");
		for (var i = 0; i < result.length; i++) {
			printTile(result[i]);
		};
		var tile = result[0];
		getPath(tile.x, tile.y, tileCandidates);
		var minFuel = gPath.fuelUsed;
		for (var i = 1; i < result.length; i++) {
			var tmp = result[i];
			getPath(tmp.x, tmp.y, tileCandidates);
			if (gPath.fuelUsed < minFuel) {
				minFuel = gPath.fuelUsed;
				tile = tmp;
			}
		};
		console.log("Next enemy tile:");
		printTile(tile);
		deleteEnemySpot(tile.x,tile.y);
		return tile;
	} else {
		return null;
	}
};

// TODO: rename and optimize to find the closest...
var scanEnemy = function() {
	var result = [];
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            if (gMap[i][j].enemySpot) {
            	result.push({x:i, y:j});
            }
        }
    }
    return result;
};

var computeNextTarget = function() {
	var distance = 1;
	var maxDistance = computeMaxDistance(gX,gY);
	var result = {found: false};
	while ((!result.found)&&(distance<=maxDistance)) {
		result = checkTileAtDistance(distance, TileEnum.OBJECT);
		if (result.found) {
			return result.tile;
		}
		result = checkTileAtDistance(distance, TileEnum.TARGET);
		if (result.found) {
			return result.tile;
		}
		distance++;
	}
	return null;
};

// TODO: if score is equal, the longest branch can also be used!
var computePositionTile = function() {
	var tile = {x:gX, y:gY};
	var maxScore = 0;
	var minDistance = gWidth*gWidth+gHeight*gHeight;
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
        	if (gMap[i][j].value === TileEnum.EMPTY) {
	        	var score = computeScore(i, j);
	        	if (score > maxScore ) {
	        		maxScore = score;
	        		tile = {x: i, y: j};
	        	} 
	        	if (score === maxScore) {
	        		// TODO: could be optimized by calculating the real path with getPath...
	        		distance = (gX-i)*(gX-i)+(gY-j)*(gY-j);
	        		if (distance < minDistance) {
	        			minDistance = distance;
	        			tile = {x: i, y:j};
	        		}
	        	}
        	}
        }
    }
    return tile;
};

var computeScore = function(x, y) {
	var result = 0;
	var hasWall = false;
	var i=1;
	while(gMap[x+i][y].value === TileEnum.EMPTY)) {
		i++;
	}
	result += i*i;
	if (i===1) {
		hasWall = true;
	}
	i=1;
	while(gMap[x-i][y].value === TileEnum.EMPTY)) {
		i++;
	}
	result += i*i;
	if (i===1) {
		hasWall = true;
	}
	i=1;
	while(gMap[x][y+i].value === TileEnum.EMPTY)) {
		i++;
	}
	result += i*i;
	if (i===1) {
		hasWall = true;
	}
	i=1;
	while(gMap[x][y-i].value === TileEnum.EMPTY)) {
		i++;
	}
	result += i*i;
	if (i===1) {
		hasWall = true;
	}
	if (hasWall) {
		return result;
	}
	return 0;
};

var computeOrientation = function() {
	// we will face the direction where we can find the most UNKNOWN tile
	var result = undefined;
	var maxUnknown = 0;
	var count = 0;
	// NORTH
	console.log("computeOrientation width: "+gWidth);
	console.log("computeOrientation height: "+gHeight);
	for (var i = 0; i < gWidth; i++) {
		for (var j = gY+1; j < gHeight; j++) {
			if (gMap[i][j].value === TileEnum.UNKNOWN) {
				count++;
			}
		}
	}
	console.log("computeOrientation NORTH: "+count);
	if (count > maxUnknown) {
		result = DirectionEnum.NORTH;
		maxUnknown = count;
		count = 0;
	}
	// EAST
	for (var i = gX+1; i < gWidth; i++) {
		for (var j = 0; j < gHeight; j++) {
			if (gMap[i][j].value === TileEnum.UNKNOWN) {
				count++;
			}
		}
	}
	console.log("computeOrientation EAST: "+count);
	if (count > maxUnknown) {
		result = DirectionEnum.EAST;
		maxUnknown = count;
		count = 0;
	}
	// SOUTH
	for (var i = 0; i < gWidth; i++) {
		for (var j = 0; j < gY; j++) {
			if (gMap[i][j].value === TileEnum.UNKNOWN) {
				count++;
			}
		}
	}
	console.log("computeOrientation SOUTH: "+count);
	if (count > maxUnknown) {
		result = DirectionEnum.SOUTH;
		maxUnknown = count;
		count = 0;
	}
	// WEST
	for (var i = 0; i < gX; i++) {
		for (var j = 0; j < gHeight; j++) {
			if (gMap[i][j].value === TileEnum.UNKNOWN) {
				count++;
			}
		}
	}
	console.log("computeOrientation WEST: "+count);
	if (count > maxUnknown) {
		result = DirectionEnum.WEST;
		maxUnknown = count;
		count = 0;
	}
	return result;
}

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
// TODO, can be refactored with computeScore...
var viewCandidates = function(x, y) {
	var i=1;
	while(gMap[x+i][y].value === TileEnum.EMPTY)) {
		gCandidates.push({x:x+i,y:y});
		i++;
	}
	i=1;
	while(gMap[x-i][y].value === TileEnum.EMPTY)) {
		gCandidates.push({x:x-i,y:y});
		i++;
	}
	i=1;
	while(gMap[x][y+i].value === TileEnum.EMPTY)) {
		gCandidates.push({x:x,y:y+i});
		i++;
	}
	i=1;
	while(gMap[x][y-i].value === TileEnum.EMPTY)) {
		gCandidates.push({x:x,y:y-i});
		i++;
	}
};

var exploreCandidates = function(x, y) {
	//TODO: copy the function checkTileAtDistance...
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
		gPath.isArrived = true;
		return;
	}
	var tile = gPath.steps[gPath.step];
	console.log("Performing step "+gPath.step+": ("+tile.x+","+tile.y+")");
	try {
		performMoveTo(tile);
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
				case DirectionEnum.SOUTH:
					moveBackward();
				case DirectionEnum.EAST:
					turnRight();
				case DirectionEnum.WEST:
					turnLeft();
			}
		case DirectionEnum.SOUTH:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					moveBackward();
				case DirectionEnum.SOUTH:
					moveForward();
				case DirectionEnum.EAST:
					turnLeft();
				case DirectionEnum.WEST:
					turnRight();
			}
		case DirectionEnum.EAST:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					turnLeft();
				case DirectionEnum.SOUTH:
					turnRight();
				case DirectionEnum.EAST:
					moveForward();
				case DirectionEnum.WEST:
					moveBackward();
			}
		case DirectionEnum.WEST:
			switch(goingTo) {
				case DirectionEnum.NORTH:
					turnRight();
				case DirectionEnum.SOUTH:
					turnLeft();
				case DirectionEnum.EAST:
					moveBackward();
				case DirectionEnum.WEST:
					moveForward();
			}
	}
};

var performOrientation = function(direction) {
	switch(gDirection) {
		case DirectionEnum.NORTH:
			switch(direction) {
				case DirectionEnum.SOUTH:
					turnLeft();
				case DirectionEnum.EAST:
					turnRight();
				case DirectionEnum.WEST:
					turnLeft();
			}
			break;
		case DirectionEnum.SOUTH:
			switch(direction) {
				case DirectionEnum.NORTH:
					turnLeft();
				case DirectionEnum.EAST:
					turnLeft();
				case DirectionEnum.WEST:
					turnRight();
			}
			break;
		case DirectionEnum.EAST:
			switch(direction) {
				case DirectionEnum.NORTH:
					turnLeft();
				case DirectionEnum.SOUTH:
					turnRight();
				case DirectionEnum.WEST:
					turnLeft();
			}
			break;
		case DirectionEnum.WEST:
			switch(direction) {
				case DirectionEnum.NORTH:
					turnRight();
				case DirectionEnum.SOUTH:
					turnLeft();
				case DirectionEnum.EAST:
					turnLeft();
			}
			break;
		}
};
