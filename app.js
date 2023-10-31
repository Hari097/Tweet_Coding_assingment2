const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

const { open } = require("sqlite");

const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
const databaseConnection = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3002, () => {
      console.log(`localhost:3002 running...`);
    });
  } catch (e) {
    console.log(`Database Connection issue ${e.message}`);
  }
};

databaseConnection();

const getFollowingPeopleIds = async (username) => {
  const getFollowingPeopleQuery = `
SELECT
 following_user_id
 FROM
 follower INNER JOIN user ON user.user_id = follower.follower_id
 WHERE
 user.username = '${username}'`;
  const followingPeople = await db.all(getFollowingPeopleQuery);
  const arrayPeople = followingPeople.map(
    (eachPeople) => eachPeople.following_user_id
  );
  return arrayPeople;
};

const authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken) {
    jwt.verify(jwtToken, "SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.user_id = payload.user_id;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

const tweetAccessVerification = async (request, response, next) => {
  const { tweetId } = request.params;
  const { userId } = request;
  const getTweetQuery = `
  SELECT
   *
 FROM
     tweet
 INNER JOIN
      ON follower ON tweet.tweet_id = follower.following_user_id
 WHERE
 tweet.tweet_id = ${tweetId} AND  follower.follower_user_id= ${userId} `;
  const getTweet = await db.get(getTweetQuery);
  if (getTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};
// API: 1;
app.post("/register/", async (request, response) => {
  try {
    const { username, password, name, gender } = request.body;
    const getUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
    const dbUser = await db.get(getUserQuery);

    if (dbUser === undefined) {
      if (String(password).length < 6) {
        response.status(400);
        response.send("Password is too short");
      } else {
        const hashPassword = await bcrypt.hash(password, 7);
        const createUserQuery = `
        INSERT INTO
          user (name, username,password, gender)
        VALUES
          (
            '${name}',
            '${username}',
            '${hashPassword}',
            '${gender}',

          )`;
        const dbResponse = await db.run(createUserQuery);
        response.status(200);
        response.send("User created successfully");
      }
    } else {
      response.status(400);
      response.send("User already exists");
    }
  } catch (e) {
    console.log(`API error ${e.message}`);
  }
});

// API:2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const userLoginQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const userLogin = await db.get(userLoginQuery);
  if (userLogin === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userLogin.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username,
        userId: userLogin.user_id,
      };
      const jwtToken = jwt.sign(payload, "SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
// API:3
app.get("/user/tweets/feed/", authentication, async (request, response) => {
  const { username } = request;
  const followingPeopleId = getFollowingPeopleIds(username);
  const getTweetQuery = `
  SELECT
  username, tweet,date_time as dateTime
  FROM
   user INNER JOIN tweet ON user.user_id = tweet.tweet_id
   WHERE
   user.user_id in (${followingPeopleId})
   ORDER BY date_time desc
   LIMIT 4`;
  const tweet = await db.all(getTweetQuery);
  response.send(tweet);
});
// API:4
app.get("/user/following/", authentication, async (request, response) => {
  const { username, userId } = request;
  const getFollowingQuery = `
SELECT
name
 FROM
 follower INNER JOIN user ON user.user_id = follower.follower_id
 WHERE
 following_user_id = ${userId}`;
  const followingPeople = await db.all(getFollowingQuery);
  response.send(followingPeople);
});
// API:5
app.get("/user/following/", authentication, async (request, response) => {
  const { username, userId } = request;
  const getFollowingQuery = `
SELECT DISTINCT
name
 FROM
 follower INNER JOIN user ON user.user_id = follower.follower_id
 WHERE
 following_user_id = ${userId}`;
  const followingPeople = await db.all(getFollowingQuery);
  response.send(followingPeople);
});
// API:6
app.get(
  "/tweets/:tweetId/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `
    SELECT
    tweet ,
    (SELECT COUNT() FROM like WHERE like_id='${tweetId}') AS likes,
     (SELECT COUNT() FROM reply WHERE like_id='${tweetId}') AS replies,
     date_time AS dateTime
     FROM
     tweet
     WHERE
     tweet.tweet_id = ${tweetId}`;

    const tweet = await db.get(getTweetQuery);
    response.send(tweet);
  }
);

// API:7
app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikeQuery = `
   SELECT
   username
   FROM
   user INNER JOIN like ON user.user_id = like.user_id
   WHERE
   tweet_id = ${tweetId}`;

    const likedUser = await db.all(getLikeQuery);
    response.send({ likes: likedUser });
  }
);

// API:8

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    getRepliedQuery = `
    SELECT
     name,reply
     FROM  user INNER JOIN reply  ON user.user_id = reply.user_id
     WHERE
     tweet_id = ${tweetId}`;
    const repliedUsers = await db.all(getRepliedQuery);
    response.send({ replies: repliedUsers });
  }
);

// API:9
app.get("/user/tweets/", authentication, async (request, response) => {
  const { userId } = request;
  const getTweetsQuery = `
  SELECT
  tweet,
  COUNT(DISTINCT like_id) AS likes,
   COUNT(DISTINCT reply_id) AS replies,
   date_time AS dateTime
  FROM
  tweet
   LEFT JOIN
   reply  ON tweet.tweet_id = reply.tweet_id
  LEFT JOIN
  like ON tweet.tweet_id = like.tweet_id
   WHERE
   tweet.tweet_id = '${userId}'
   GROUP BY
   tweet.tweet_id`;

  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

// API:10
app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet } = request.body;
  const getUserId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const createTweetQuery = `
  INSERT INTO
  tweet(tweet,user_id,date_time)
  VALUES('${tweet}','${getUserId}','${dateTime}')`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  const { userId } = request;
  const getTweetQuery = `SELECT * FROM tweet WHERE user_id = ${userId} AND tweet_id = ${tweetId}`;
  const tweet = await db.run(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweet = `
    DELETE FROM tweet WHERE tweet_id = ${tweetId}`;
    const deleted = await db.run(deleteTweet);
    response.send("Tweet Removed");
  }
});

module.exports = app;
