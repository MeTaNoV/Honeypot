var api = require('./API.js');

/**
 * Executes a single step of the tank's programming. The tank can only move,
 * turn, or fire its cannon once per turn. Between each update, the tank's
 * engine remains running and consumes 1 fuel. This function will be called
 * repeatedly until there are no more targets left on the grid, or the tank runs
 * out of fuel.
 */

//---------------------------------------------------------------------------
// Constant and Global Definition
//---------------------------------------------------------------------------
test
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
    WALL: 4,
    TARGET: 8,
    ENEMY: 16
};

var StateEnum = {
    INIT: 0,
    SEARCHING_POSITION: 1,
    TAKING_POSITION: 2,
    SEARCHING_ENEMY: 3,
    SEARCHING_TARGET: 4
};

var MAX_DISCOVERY_ROUNDS = 9;
var MAX_HOLDING_POSITION = MAX_DISCOVERY_ROUNDS+10;
var MAX_HOLDING_INCREASE = 2;

var FUEL_IDLE = 1;
var FUEL_MOVE = 1+FUEL_IDLE;
var FUEL_TURN = 1+FUEL_IDLE;
var FUEL_ATTACKED = 50;

var gDirection = DirectionEnum.NORTH;
var gMap = [];
var gWidth = 0;
var gHeight = 0;
var gX = 0;
var gY = 0;
var gLidar = [0,0,0,0];
var gTargetTile;
var gTargetNextTile;
var gState = StateEnum.INIT;

var gFuel = 0;
var gRound = 1;

var gPath = null;
var gCandidates = [];

var gTargetConfirmed = false;
var gAttacked = false;
var gAvoidBorder = true;
var gHoldLonger = 0;

// TODO: if an object is inside the map, it could be worth to identify it ASAP
// TODO: during searching enemy phase, make a choice between next enemy and exploration depending on distance
// TODO: take into account gAttacked !!

//---------------------------------------------------------------------------
// Main Update Function
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
        computeTargetTiles();
        if (identifyTarget()) {
            if (gTargetConfirmed) {
                fireCannon();               
            }
        } else {
            gTargetTile.value = TileEnum.WALL;
        }
        if (gState === StateEnum.SEARCHING_POSITION) {
            while (gState === StateEnum.SEARCHING_POSITION) {
                console.log("Seek and Destroy Enemy!!!");
                seekAndDestroy(TileEnum.ENEMY);
                console.log("Discovering Position");
                discoverPosition();
            }
        }
        if (gState === StateEnum.TAKING_POSITION) {
            var limitRound = MAX_HOLDING_POSITION+gHoldLonger;
            console.log("Keeping position until round "+limitRound);
            while (gState === StateEnum.TAKING_POSITION) {
                console.log("Seek and Destroy Enemy!!!");
                seekAndDestroy(TileEnum.ENEMY);
                console.log("Taking Position");
                takePosition();
            }
        }
        if (gState === StateEnum.SEARCHING_ENEMY) {
            while (gState === StateEnum.SEARCHING_ENEMY) {
                console.log("Seek and Destroy Enemy!!!");
                seekAndDestroy(TileEnum.ENEMY);
                console.log("Seek and Destroy Object!!!");
                seekAndDestroy(TileEnum.OBJECT);
                console.log("Seek and Destroy Target!!!");
                seekAndDestroy(TileEnum.TARGET);
                console.log("Searching Enemy");
                lookForEnemy();
            }
        }
        if (gState === StateEnum.SEARCHING_TARGET) {
            while (gState === StateEnum.SEARCHING_TARGET) {
                console.log("Seek and Destroy Target!!!");
                seekAndDestroy(TileEnum.TARGET);
                console.log("Searching Target");
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
// Wrappers to API functions
//---------------------------------------------------------------------------

var getLidar = function() {
    gLidar[gDirection] = api.lidarFront();    
    gLidar[(gDirection+1)%4] = api.lidarRight();
    gLidar[(gDirection+2)%4] = api.lidarBack();
    gLidar[(gDirection+3)%4] = api.lidarLeft();
    //console.log("Lidar: "+gLidar);
};

var identifyTarget = function() {
    // we confirmed a target if the enemy is on the next tile (both type 1&2)
    // and if we check a progressing enemy (type 2)
    gTargetConfirmed = false;
    if (api.identifyTarget()) {
        if (gAvoidBorder && isTargetOnBorder(gTargetTile)) {
            console.log("On border...");
            printTile(gTargetTile);
            return true;
        }
        switch(gTargetTile.value) {
            case TileEnum.ENEMY:
                if (gState !== StateEnum.SEARCHING_POSITION) {
                    gTargetConfirmed = true;
                }
                // check if the enemy got closer
                if (gTargetNextTile && 
                    !gTargetNextTile.periodicEnemy && 
                    gTargetNextTile.value === TileEnum.ENEMY) {
                    gTargetConfirmed = true;
                }
                // for safety reason... might be too late...
                if (gLidar[gDirection] === 1) {
                    gTargetConfirmed = true;
                }
                // we can override the previous result if we are on a periodic enemy tile!
                if (gTargetTile.periodicEnemy) {
                    gTargetConfirmed = false;
                }
                break;
            case TileEnum.OBJECT:
                // not sure if we should do this!
                if (gLidar[gDirection] === 1) {
                    gTargetConfirmed = true;
                }
                break;
            case TileEnum.WALL|TileEnum.TARGET:
                gTargetTile.value = TileEnum.TARGET;
                // we don't break since we want to check the following case after update
            case TileEnum.TARGET:
                if (gState === StateEnum.SEARCHING_ENEMY ||
                    gState === StateEnum.SEARCHING_TARGET) {
                    gTargetConfirmed = true;
                }
                break;
            default:
                throw "Error in identifyTarget: "+gTargetTile.value;
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
            col[j] = { x: i, y: j, value: TileEnum.UNKNOWN };
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

    // init the first visible tiles on map
    gMap[gX][0].value = TileEnum.OBJECT;
    gMap[gX][0].vChecked = true;
    for (var i=1; i<gLidar[DirectionEnum.NORTH]+gLidar[DirectionEnum.SOUTH]; i++) {
        setEmptyTile(gX,i);
        gMap[gX][i].vChecked = true;
    }
    gMap[gX][gLidar[DirectionEnum.NORTH]+gLidar[DirectionEnum.SOUTH]].value = TileEnum.OBJECT;
    gMap[gX][gLidar[DirectionEnum.NORTH]+gLidar[DirectionEnum.SOUTH]].vChecked = true;

    gMap[0][gY].value = TileEnum.OBJECT;
    gMap[0][gY].hChecked = true;
    for (var j=1; j<gLidar[DirectionEnum.EAST]+gLidar[DirectionEnum.WEST]; j++) {
        setEmptyTile(j,gY);
        gMap[j][gY].hChecked = true;
    }
    gMap[gLidar[DirectionEnum.EAST]+gLidar[DirectionEnum.WEST]][gY].value = TileEnum.OBJECT;
    gMap[gLidar[DirectionEnum.EAST]+gLidar[DirectionEnum.WEST]][gY].hChecked = true;
    
    // switching to next state
    gState = StateEnum.SEARCHING_POSITION;
    gFuel = api.currentFuel();
    gRound++;

    // print infos
    console.log("x: "+gX+", y: "+gY+" dir: "+gDirection);
    printMap();
    console.log("Starting fuel: "+gFuel);
    //console.log("State: "+gState);
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
    var yMin = gY-gLidar[DirectionEnum.SOUTH];
    var yMax = gY+gLidar[DirectionEnum.NORTH];

    setLidarTile(gX, yMin);
    gMap[gX][yMin].vChecked = true;
    if (gMap[gX][yMin].vChecked && gMap[gX][yMin].hChecked) {
        delete gMap[gX][yMin].periodicEnemy;
    }
    for (var i=yMin+1; i<yMax; i++) {
        setEmptyTile(gX, i);
        gMap[gX][i].vChecked = true;
        if (gMap[gX][i].vChecked && gMap[gX][i].hChecked) {
            delete gMap[gX][i].periodicEnemy;
        }
    }
    setLidarTile(gX, yMax);
    gMap[gX][yMax].vChecked = true;
    if (gMap[gX][yMax].vChecked && gMap[gX][yMax].hChecked) {
        delete gMap[gX][yMax].periodicEnemy;
    }

    // updating line taking into account previous state
    var xMin = gX-gLidar[DirectionEnum.WEST];
    var xMax = gX+gLidar[DirectionEnum.EAST];

    setLidarTile(xMin, gY);
    gMap[xMin][gY].hChecked = true;
    if (gMap[xMin][gY].vChecked && gMap[xMin][gY].hChecked) {
        delete gMap[xMin][gY].periodicEnemy;
    }
    for (var j=xMin+1; j<xMax; j++) {
        setEmptyTile(j,gY);
        gMap[j][gY].hChecked = true;
        if (gMap[j][gY].vChecked && gMap[j][gY].hChecked) {
            delete gMap[j][gY].periodicEnemy;
        }
    }
    setLidarTile(xMax, gY);
    gMap[xMax][gY].hChecked = true;
    if (gMap[xMax][gY].vChecked && gMap[xMax][gY].hChecked) {
        delete gMap[xMax][gY].periodicEnemy;
    }

    if (api.currentFuel() < (gFuel - FUEL_ATTACKED)) {
        gAttacked = true;
        console.log("!!! Attacked !!!");
    } else {
        gAttacked = false;
    }

    gFuel = api.currentFuel();
    gRound++;

    console.log("x: "+gX+", y: "+gY+" dir: "+gDirection);
    printMap();
    console.log("Current fuel: "+gFuel);
};

var increaseMap = function(tX, tY, newWidth, newHeight) {
    var result = createMap(newWidth, newHeight);

    for (var i=0; i<gWidth; i++) {
        for (var j=0; j<gHeight; j++) {
            result[i+tX][j+tY].value = gMap[i][j].value;
            result[i+tX][j+tY].hChecked = gMap[i][j].hChecked;
            result[i+tX][j+tY].vChecked = gMap[i][j].vChecked;
            result[i+tX][j+tY].periodicEnemy = gMap[i][j].periodicEnemy;
        }
    }
    if (gPath) {
        for (i = 0; i < gPath.steps.length; i++) {
            gPath.steps[i].x += tX;
            gPath.steps[i].y += tY;
        }
    }
    gWidth = newWidth;
    gHeight = newHeight;
    gX += tX;
    gY += tY;
    return result;
};

var printMap = function() {
    var i,j;
    for (i=0; i<gHeight; i++) {
        var s = "";
        for (j=0; j<gWidth; j++) {
            if (gMap[j][gHeight-1-i].vChecked) {
                s+='|';
            } else {
                s+=' ';
            }
            if ((j===gX) && ((gHeight-1-i)===gY)) {
                s+='X';
            } else if (gMap[j][gHeight-1-i].periodicEnemy) {
                s+='S';
            } else{
                switch(gMap[j][gHeight-1-i].value) {
                    case TileEnum.UNKNOWN:
                        s+='-';
                        break;
                    case TileEnum.EMPTY:
                        s+='0';
                        break;
                    case TileEnum.OBJECT:
                        s+='B';
                        break;
                    case TileEnum.ENEMY:
                        s+='E';
                        break;
                    case TileEnum.WALL:
                        s+='W';
                        break;
                    case TileEnum.TARGET:
                        s+='T';
                        break;
                    case TileEnum.WALL|TileEnum.TARGET:
                        s+='?';
                        break;
                    default:
                        s+=gMap[j][gHeight-1-i].value;
                }
            }
            if (gMap[j][gHeight-1-i].hChecked) {
                s+='-';
            } else {
                s+=' ';
            }
        }
        console.log(s);
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
        console.log("Step "+i);
        printTile(path.steps[i]);        
    }
};

var setEmptyTile = function(x, y) {
    switch (gMap[x][y].value) {
        case TileEnum.UNKNOWN:
            break;
        case TileEnum.EMPTY:
            break;
        case TileEnum.OBJECT:
        // there is a case where a periodic on a wall is considered as WALL|TARGET because it bumps
        case TileEnum.WALL|TileEnum.TARGET:
        case TileEnum.ENEMY:
            //if (!isTileInView(x, y) || !gTargetConfirmed) {
            if (!gTargetConfirmed) {
                console.log("periodicEnemy spotted at: "+x+","+y);
                gMap[x][y].periodicEnemy = true;
            }
            break;
        case TileEnum.TARGET:
            break;
        default:
            throw "=================== Problem setting tile ("+x+","+y+"): "+gMap[x][y].value+" ===================";
    }
    gMap[x][y].value = TileEnum.EMPTY;
};

var isTileInView = function(x, y) {
    var result = false;
    switch(gDirection) {
        case DirectionEnum.NORTH:
            result = (gX === x) && (gY < y);
            break;
        case DirectionEnum.EAST:
            result = (gX < x) && (gY === y);
            break;
        case DirectionEnum.SOUTH:
            result = (gX === x) && (gY > y);
            break;
        case DirectionEnum.WEST:
            result = (gX > x) && (gY === y);
            break;
    }
    return result;
};

var isTargetOnBorder = function(tile) {
    var result = false;

    result = (tile.x === gHeight-1) ||
             (tile.y === gWidth-1) ||
             (tile.x === 0) ||
             (tile.y === 0);

    return result;
};

var setLidarTile = function(x, y) {
    switch (gMap[x][y].value) {
        case TileEnum.UNKNOWN:
            gMap[x][y].value = TileEnum.OBJECT;
            break;
        case TileEnum.EMPTY:
            gMap[x][y].value = TileEnum.ENEMY;
            break;
        case TileEnum.OBJECT:
            gMap[x][y].value = TileEnum.WALL|TileEnum.TARGET;
            break;
        case TileEnum.WALL:
            break;
        case TileEnum.TARGET:
            break;
        case TileEnum.WALL|TileEnum.TARGET:
            break;
        case TileEnum.ENEMY:
            break;
        default:
            throw "=================== Problem updating lidar tile: "+gMap[x][y].value+" ===================";
    }
};

var computeTargetTiles = function() {
    switch(gDirection) {
        case DirectionEnum.NORTH:
            gTargetTile = gMap[gX][gY+gLidar[gDirection]];
            if (gY+gLidar[gDirection]+1 < gHeight) {
                gTargetNextTile = gMap[gX][gY+gLidar[gDirection]+1];
            } else {
                gTargetNextTile = undefined;
            }
            break;
        case DirectionEnum.EAST:
            gTargetTile = gMap[gX+gLidar[gDirection]][gY];
            if (gX+gLidar[gDirection]+1 < gWidth) {
                gTargetNextTile = gMap[gX+gLidar[gDirection]+1][gY];
            } else {
                gTargetNextTile = undefined;
            }
            break;
        case DirectionEnum.SOUTH:
            gTargetTile = gMap[gX][gY-gLidar[gDirection]];
            if (gY-gLidar[gDirection]-1 >= 0) {
                gTargetNextTile = gMap[gX][gY-gLidar[gDirection]-1];
            } else {
                gTargetNextTile = undefined;
            }
            break;
        case DirectionEnum.WEST:
            gTargetTile = gMap[gX-gLidar[gDirection]][gY];
            if (gX-gLidar[gDirection]-1 >= 0) {
                gTargetNextTile = gMap[gX-gLidar[gDirection]-1][gY];
            } else {
                gTargetNextTile = undefined;
            }
            break;
    }
};

var isTileInList = function(x, y, list) {
    for (var i=0; i<list.length; i++) {
        if ((list[i].x === x) && (list[i].y === y)) {
            return true;
        }
    }
    return false;
};

//---------------------------------------------------------------------------
// Main algorithmic functions
//---------------------------------------------------------------------------

var discoverPosition = function() {
    if (gRound > MAX_DISCOVERY_ROUNDS) {
        gPath = null;
        gState = StateEnum.TAKING_POSITION;
    } else {
        exploreMap();
    }
};

var exploreMap = function() {
    if (gPath) {
        if (gPath.isArrived) {
            console.log("Arrived...");
            gPath = null;
        } else {
            performNextStep();
        }
    } else {
        getPath(gX, gY, exploreCandidates, true);
        console.log("Next exploration path:");
        printPath(gPath);
        if (!gPath.found) {
            console.log("None found...");
            gState = StateEnum.SEARCHING_TARGET;
            gPath = null;
        }
    }
};

var takePosition = function() {
    if (gPath) {
        if (gRound > MAX_HOLDING_POSITION+gHoldLonger) {
            gPath = null;
            gState = StateEnum.SEARCHING_ENEMY;
        } else {
            if (!gPath.isArrived) {
                performNextStep();
            } else {
                var gOrientation = computeOrientation();
                console.log("Orientating in direction: "+gOrientation);
                performOrientation(gOrientation);
                throw {isAction: true, action: "Waiting Enemy !!!"};
            }
        }
    } else {
        var gTile = computePositionTile();
        console.log("Taking Position at:");
        printTile(gTile);
        getPath(gTile.x, gTile.y, tileCandidates, false);
        console.log("Position Path:");
        printPath(gPath);
    }
};

var lookForEnemy = function() {
    if (gPath) {
        if (gPath.isArrived) {
            console.log("Arrived...");
            gPath = null;
        } else {
            performNextStep();
        }
    } else {
        getPath(gX, gY, enemyCandidates, true);
        console.log("Next enemy path:");
        printPath(gPath);
        if (!gPath.found) {
            console.log("None found...");
            gPath = null;
            exploreMap();
        }
    }
};

var lookForTarget = function() {
    if (gPath) {
        if (gPath.isArrived) {
            console.log("Arrived...");
            gPath = null;
            gState = StateEnum.SEARCHING_ENEMY;
        } else {
            performNextStep();
        }
    } else {
        getPath(gX, gY, targetCandidates, false);
        console.log("Next target path:");
        printPath(gPath);
        if (!gPath.found) {
            throw "We missed something...";
        }
    }
};

var seekAndDestroy = function(type) {
    var result = {found:false};
    var distance = Math.max(gWidth, gHeight);

    // NORTH
    if ((gMap[gX][gY+gLidar[DirectionEnum.NORTH]].value & type) &&
        !gMap[gX][gY+gLidar[DirectionEnum.NORTH]].periodicEnemy &&
        gY+gLidar[DirectionEnum.NORTH] !== gHeight-1) {
        result = {found: true, direction: DirectionEnum.NORTH};
        distance = gLidar[DirectionEnum.NORTH];
    }
    // EAST
    if ((gMap[gX+gLidar[DirectionEnum.EAST]][gY].value & type) &&
        !gMap[gX+gLidar[DirectionEnum.EAST]][gY].periodicEnemy &&
        gX+gLidar[DirectionEnum.EAST] !== gWidth-1) {
        if ((gLidar[DirectionEnum.EAST] < distance) ||
            ((gLidar[DirectionEnum.EAST] === distance && DirectionEnum.EAST === gDirection))) {
            result = {found: true, direction: DirectionEnum.EAST};
            distance = gLidar[DirectionEnum.EAST];
        }
    }
    // SOUTH
    if ((gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].value & type) &&
        !gMap[gX][gY-gLidar[DirectionEnum.SOUTH]].periodicEnemy &&
        gY-gLidar[DirectionEnum.SOUTH] !== 0) {
        if ((gLidar[DirectionEnum.SOUTH] < distance) ||
            ((gLidar[DirectionEnum.SOUTH] === distance && DirectionEnum.SOUTH === gDirection))) {
            result = {found: true, direction: DirectionEnum.SOUTH};
            distance = gLidar[DirectionEnum.SOUTH];
        }
    }
    // WEST
    if ((gMap[gX-gLidar[DirectionEnum.WEST]][gY].value & type) &&
        !gMap[gX-gLidar[DirectionEnum.WEST]][gY].periodicEnemy &&
        gX-gLidar[DirectionEnum.WEST] !== 0) {
        if ((gLidar[DirectionEnum.WEST] < distance) ||
            ((gLidar[DirectionEnum.WEST] === distance && DirectionEnum.WEST === gDirection))) {
            result = {found: true, direction: DirectionEnum.WEST};
            distance = gLidar[DirectionEnum.WEST];
        }
    }
    
    if (result.found) {
        console.log("Type: "+type+" spotted in direction: "+result.direction+" at distance: "+distance);
        // TODO: some special case might be added here...
        if (gState !== StateEnum.SEARCHING_POSITION || distance < Math.abs(gDirection-result.direction)+2) {
            performOrientation(result.direction);
        }
    }
};

//---------------------------------------------------------------------------
// Search Path Algorithms
//---------------------------------------------------------------------------

var computePositionTile = function() {
    var tile = {x:gX, y:gY};
    var maxScore = 0;
    var minDistance = gWidth*gWidth+gHeight*gHeight;
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            if ((gMap[i][j].value&TileEnum.EMPTY) === TileEnum.EMPTY) {
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
    while(gMap[x+i][y].value === TileEnum.EMPTY) {
        i++;
    }
    result += i*i;
    if (i===1) {
        hasWall = true;
    }
    i=1;
    while(gMap[x-i][y].value === TileEnum.EMPTY) {
        i++;
    }
    result += i*i;
    if (i===1) {
        hasWall = true;
    }
    i=1;
    while(gMap[x][y+i].value === TileEnum.EMPTY) {
        i++;
    }
    result += i*i;
    if (i===1) {
        hasWall = true;
    }
    i=1;
    while(gMap[x][y-i].value === TileEnum.EMPTY) {
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
    var result;
    var maxUnknown = 0;
    var i,j;
    // NORTH
    var count = 0;
    for (i = 0; i < gWidth; i++) {
        for (j = gY+1; j < gHeight; j++) {
            if (gMap[i][j].value === TileEnum.UNKNOWN) {
                count++;
            }
        }
    }
    console.log("NORTH: "+count);
    if (count > maxUnknown) {
        result = DirectionEnum.NORTH;
        maxUnknown = count;
    }
    // EAST
    count = 0;
    for (i = gX+1; i < gWidth; i++) {
        for (j = 0; j < gHeight; j++) {
            if (gMap[i][j].value === TileEnum.UNKNOWN) {
                count++;
            }
        }
    }
    console.log("EAST: "+count);
    if (count > maxUnknown) {
        result = DirectionEnum.EAST;
        maxUnknown = count;
    }
    // SOUTH
    count = 0;
    for (i = 0; i < gWidth; i++) {
        for (j = 0; j < gY; j++) {
            if (gMap[i][j].value === TileEnum.UNKNOWN) {
                count++;
            }
        }
    }
    console.log("SOUTH: "+count);
    if (count > maxUnknown) {
        result = DirectionEnum.SOUTH;
        maxUnknown = count;
    }
    // WEST
    count = 0;
    for (i = 0; i < gX; i++) {
        for (j = 0; j < gHeight; j++) {
            if (gMap[i][j].value === TileEnum.UNKNOWN) {
                count++;
            }
        }
    }
    console.log("WEST: "+count);
    if (count > maxUnknown) {
        result = DirectionEnum.WEST;
        maxUnknown = count;
    }
    return result;
};

var initSearch = function() {
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            delete gMap[i][j].searched;
            delete gMap[i][j].fuel;
        }
    }
    gPath = {found: false, fuel: 0, discovery: 0, step: 0, steps: []};
    gCandidates = [];
};

var getPath = function(x, y, candidateFunction, useDiscovery) {
    initSearch();
    candidateFunction(x, y);
    if (gCandidates.length === 0) {
        console.log("No candidates found...");
        return;
    }
    if (isTileInList(gX, gY, gCandidates)) {
        gPath.found = true;
        gPath.isArrived = true;
        return;
    }
    searchMapForward(gX, gY, gDirection, 0, [], useDiscovery);
    searchMapLeft(gX, gY, gDirection, 0, [], useDiscovery);
    searchMapRight(gX, gY, gDirection, 0, [], useDiscovery);
    searchMapBackward(gX, gY, gDirection, 0, [], useDiscovery);
};

var exploreCandidates = function(x, y) {
    var distance = 1;
    var maxDistance = computeMaxDistance(x,y);
    while (distance<=maxDistance) {
        checkTilesAtDistance(distance);
        distance++;
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

var checkTilesAtDistance = function(distance) {
    for (var i = 0; i <= distance; i++) {
        if (isTilePossibleCandidate(gX-i,gY+distance-i)) {
            gCandidates.push({x:gX-i, y:gY+distance-i});
        }
        if (isTilePossibleCandidate(gX+i,gY+distance-i)) {
            gCandidates.push({x:gX+i, y:gY+distance-i});
        }
        if (isTilePossibleCandidate(gX-i,gY-distance+i)) {
            gCandidates.push({x:gX-i, y:gY-distance+i});
        }
        if (isTilePossibleCandidate(gX+i,gY-distance+i)) {
            gCandidates.push({x:gX+i, y:gY-distance+i});
        }
    }
};

var isTilePossibleCandidate = function(x, y) {
    if (x<0 || x>=gWidth) {
        return false;
    }
    if (y<0 || y>=gHeight) {
        return false;
    }
    tile = gMap[x][y];
    return (tile.value === TileEnum.EMPTY) && (!tile.periodicEnemy) && (!tile.vChecked || !tile.hChecked);
};

var tileCandidates = function(x, y) {
    gCandidates.push(gMap[x][y]);
};

var enemyCandidates = function(x, y) {
    // if we discovered any periodic enemy, we have to attack them on the border 
    // to minimize the chance to be attacked once there
    // TODO: waiting next to such tile might even be better
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            var tile = gMap[i][j];
            if (tile.periodicEnemy) {
                var k;
                if (!tile.vChecked) {
                    k = 1;
                    while((j+k < gHeight) && (gMap[i][j+k].value === TileEnum.EMPTY)) {
                        k++;
                    }
                    gCandidates.push(gMap[i][j+k-1]);
                    //printTile(gMap[i][j+k-1]);
                    k = 1;
                    while((j-k >= 0) && (gMap[i][j-k].value === TileEnum.EMPTY)) {
                        k++;
                    }
                    gCandidates.push(gMap[i][j-k+1]);
                    //printTile(gMap[i][j-k+1]);
                }
                if (!tile.hChecked) {
                    k = 1;
                    while((i+k < gWidth) && (gMap[i+k][j].value === TileEnum.EMPTY)) {
                        k++;
                    }
                    gCandidates.push(gMap[i+k-1][j]);
                    //printTile(gMap[i+k-1][j]);
                    k = 1;
                    while((i-k >= 0) && (gMap[i-k][j].value === TileEnum.EMPTY)) {
                        k++;
                    }
                    gCandidates.push(gMap[i-k+1][j]);
                    //printTile(gMap[i-k+1][j]);
                }
            }
        }
    }
    exploreCandidates(x, y);
};

var targetCandidates = function(x, y) {
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            var tile = gMap[i][j];
            if (tile.value&TileEnum.OBJECT || tile.value&TileEnum.TARGET ) {
                var k = 1;
                while((j+k < gHeight) && (gMap[i][j+k].value === TileEnum.EMPTY)) {
                    gCandidates.push(gMap[i][j+k]);
                    k++;
                }
                k = 1;
                while((j-k >= 0) && (gMap[i][j-k].value === TileEnum.EMPTY)) {
                    gCandidates.push(gMap[i][j-k]);
                    k++;
                }
                k = 1;
                while((i+k < gWidth) && (gMap[i+k][j].value === TileEnum.EMPTY)) {
                    gCandidates.push(gMap[i+k][j]);
                    k++;
                }
                k = 1;
                while((i-k >= 0) && (gMap[i-k][j].value === TileEnum.EMPTY)) {
                    gCandidates.push(gMap[i-k][j]);
                    k++;
                }
            }
        }
    }
};

// could be optimized will parallel computing... or taking into account search direction...
var searchMapForward = function(x, y, direction, fuel, path, useDiscovery) {
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
    fuel += FUEL_MOVE;
    searchMapMove(x, y, direction, fuel, path, useDiscovery);
};

var searchMapLeft = function(x, y, direction, fuel, path, useDiscovery) {
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
    fuel += FUEL_TURN+FUEL_MOVE;
    searchMapMove(x, y, direction, fuel, path, useDiscovery);
};

var searchMapBackward = function(x, y, direction, fuel, path, useDiscovery) {
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
    fuel += FUEL_MOVE;
    searchMapMove(x, y, direction, fuel, path, useDiscovery);
};

var searchMapRight = function(x, y, direction, fuel, path, useDiscovery) {
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
    fuel += FUEL_TURN+FUEL_MOVE;
    searchMapMove(x, y, direction, fuel, path, useDiscovery);
};

var searchMapMove = function(x, y, direction, fuel, path, useDiscovery) {
    if (!(gMap[x][y].value === TileEnum.EMPTY ||
          gMap[x][y].value === TileEnum.ENEMY)) {
        return;
    }
    if (isTileInList(x, y, path)) {
        return;
    }

    if (!gMap[x][y].searched) {
        gMap[x][y].searched = true;
    } else {
        if (gMap[x][y].fuel < fuel) {
            return;
        }
    }

    gMap[x][y].fuel = fuel;
    path.push(gMap[x][y]);

    if (isTileInList(x, y, gCandidates)) {
        var discovery = 0;
        if (useDiscovery) {
            initDiscovery();
            discovery = computePathDiscovery(path);            
        }
        //console.log("Another path to ("+x+","+y+") is found with: fuel: "+fuel+" and discovery: "+discovery);
        if (gPath.found) {
            // we update if we have a better discovery factor
            if (gPath.discovery < discovery) {
                gPath.fuel = fuel;
                gPath.discovery = discovery;
                gPath.steps = path.slice();
                //console.log("Better discovery path: ");
                //printPath(gPath);
                return;
            }
            // for a similar discovery, we take the best fuel consumption
            if (gPath.discovery === discovery && gPath.fuel > fuel) {
                gPath.fuel = fuel;
                gPath.discovery = discovery;
                gPath.steps = path.slice();
                //console.log("Better fuel path: ");
                //printPath(gPath);
            }               
        } else {
            // first path found so far!!
            gPath.found = true;
            gPath.fuel = fuel;
            gPath.discovery = discovery;
            gPath.steps = path.slice();
            //console.log("First path: ");
            //printPath(gPath);
        }
        return;
    }

    searchMapForward(x, y, direction, fuel, path.slice(), useDiscovery);
    searchMapLeft(x, y, direction, fuel, path.slice(), useDiscovery);
    searchMapRight(x, y, direction, fuel, path.slice(), useDiscovery);
    searchMapBackward(x, y, direction, fuel, path.slice(), useDiscovery); 
};

var initDiscovery = function() {
    for(var i=0; i<gWidth; i++) {
        for (j=0; j<gHeight; j++) {
            delete gMap[i][j].discovered;
        }
    }
};

var computePathDiscovery = function(path) {
    var result = 0;
    for (var i = 0; i < path.length; i++) {
        result += computeDiscovery(path[i]);
    }
    return result;
};

var computeDiscovery = function(tile) {
    var result = 0;
    var x = tile.x;
    var y = tile.y;

    var i=1;
    while((x+i < gWidth) && ((gMap[x+i][y].value === TileEnum.UNKNOWN) || (gMap[x+i][y].value === TileEnum.EMPTY))) {
        if (gMap[x+i][y].value === TileEnum.UNKNOWN &&
            !gMap[x+i][y].discovered) {
            gMap[x+i][y].discovered = true;
            result++;
        }
        i++;
    }
    i=1;
    while((x-i >= 0) && ((gMap[x-i][y].value === TileEnum.UNKNOWN) || (gMap[x-i][y].value === TileEnum.EMPTY))) {
        if (gMap[x-i][y].value === TileEnum.UNKNOWN &&
            !gMap[x-i][y].discovered) {
            gMap[x-i][y].discovered = true;
            result++;
        }
        i++;
    }
    i=1;
    while((y+i < gHeight) && ((gMap[x][y+i].value === TileEnum.UNKNOWN) || (gMap[x][y+i].value === TileEnum.EMPTY))) {
        if (gMap[x][y+i].value === TileEnum.UNKNOWN &&
            !gMap[x][y+i].discovered) {
            gMap[x][y+i].discovered = true;
            result++;
        }
        i++;
    }
    i=1;
    while((y-i >= 0) && ((gMap[x][y-i].value === TileEnum.UNKNOWN) || (gMap[x][y-i].value === TileEnum.EMPTY))) {
        if (gMap[x][y-i].value === TileEnum.UNKNOWN &&
            !gMap[x][y-i].discovered) {
            gMap[x][y-i].discovered = true;
            result++;
        }
        i++;
    }

    return result;
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
    if (tile.value !== TileEnum.EMPTY) {
        throw {isAction: true, action: "Tile occupied by an enemy, waiting one turn!"};
    }

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
        throw "Problem in move...";
    }

    switch(gDirection) {
        case DirectionEnum.NORTH:
            switch(goingTo) {
                case DirectionEnum.NORTH:
                    moveForward();
                    break;
                case DirectionEnum.SOUTH:
                    moveBackward();
                    break;
                case DirectionEnum.EAST:
                    turnRight();
                    break;
                case DirectionEnum.WEST:
                    turnLeft();
                    break;
            }
            break;
        case DirectionEnum.SOUTH:
            switch(goingTo) {
                case DirectionEnum.NORTH:
                    moveBackward();
                    break;
                case DirectionEnum.SOUTH:
                    moveForward();
                    break;
                case DirectionEnum.EAST:
                    turnLeft();
                    break;
                case DirectionEnum.WEST:
                    turnRight();
                    break;
            }
            break;
        case DirectionEnum.EAST:
            switch(goingTo) {
                case DirectionEnum.NORTH:
                    turnLeft();
                    break;
                case DirectionEnum.SOUTH:
                    turnRight();
                    break;
                case DirectionEnum.EAST:
                    moveForward();
                    break;
                case DirectionEnum.WEST:
                    moveBackward();
                    break;
            }
            break;
        case DirectionEnum.WEST:
            switch(goingTo) {
                case DirectionEnum.NORTH:
                    turnRight();
                    break;
                case DirectionEnum.SOUTH:
                    turnLeft();
                    break;
                case DirectionEnum.EAST:
                    moveBackward();
                    break;
                case DirectionEnum.WEST:
                    moveForward();
                    break;
            }
            break;
    }
};

var performOrientation = function(direction) {
    switch(gDirection) {
        case DirectionEnum.NORTH:
            switch(direction) {
                case DirectionEnum.SOUTH:
                    turnLeft();
                    break;
                case DirectionEnum.EAST:
                    turnRight();
                    break;
                case DirectionEnum.WEST:
                    turnLeft();
                    break;
            }
            break;
        case DirectionEnum.SOUTH:
            switch(direction) {
                case DirectionEnum.NORTH:
                    turnLeft();
                    break;
                case DirectionEnum.EAST:
                    turnLeft();
                    break;
                case DirectionEnum.WEST:
                    turnRight();
                    break;
            }
            break;
        case DirectionEnum.EAST:
            switch(direction) {
                case DirectionEnum.NORTH:
                    turnLeft();
                    break;
                case DirectionEnum.SOUTH:
                    turnRight();
                    break;
                case DirectionEnum.WEST:
                    turnLeft();
                    break;
            }
            break;
        case DirectionEnum.WEST:
            switch(direction) {
                case DirectionEnum.NORTH:
                    turnRight();
                    break;
                case DirectionEnum.SOUTH:
                    turnLeft();
                    break;
                case DirectionEnum.EAST:
                    turnLeft();
                    break;
            }
            break;
        }
};
